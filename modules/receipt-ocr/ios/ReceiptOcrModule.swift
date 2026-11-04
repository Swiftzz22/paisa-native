import ExpoModulesCore
import UIKit
import Vision
import VisionKit

/**
 * Receipt text recognition on the phone, with Apple Vision. Free, offline,
 * and the photo never leaves the device.
 *
 * It replaces expo-text-extractor, which called Vision with its defaults:
 * English only, and the photo read without its orientation. A receipt from
 * Tokyo or Bangkok came back as noise, and a portrait camera photo was read
 * on its side. This also returns where each piece of text sits, so the JS
 * side can put "TOTAL" and "S$14.93" back on the same line.
 *
 * Three ways in: a photo already taken (`recognize`); Apple's document
 * camera (`scanDocument`), which takes the shot by itself once the receipt is
 * steady; and the live scanner (`startLiveScan`, iOS 16+), which reads text
 * and QR codes straight off the camera feed, with no photo at all, and keeps
 * reporting what it sees until the app has enough to log.
 */
public class ReceiptOcrModule: Module {
  /** The scan in progress: its promise, and the delegate the camera holds weakly. */
  private var scanning: (promise: Promise, delegate: ScanDelegate)?
  /** The live scanner on screen (a LiveScanner; typed loosely for iOS 15). */
  private var live: AnyObject?

  public func definition() -> ModuleDefinition {
    Name("ReceiptOcr")

    Constants([
      "isSupported": true,
      // The document camera needs a real camera; false in the simulator.
      "canScanDocuments": VNDocumentCameraViewController.isSupported,
    ])

    Events("onLiveText", "onLiveCode", "onLiveClosed")

    // Apple's live scanner is main-thread only, so everything touching it
    // runs in a main-actor task.
    AsyncFunction("canScanLive") { (promise: Promise) in
      guard #available(iOS 16.0, *) else {
        promise.resolve(false)
        return
      }
      Task { @MainActor in
        promise.resolve(DataScannerViewController.isSupported && DataScannerViewController.isAvailable)
      }
    }

    // Opens the live scanner and resolves once it's on screen. What it sees
    // arrives as onLiveText ({ blocks }) and onLiveCode ({ data }) events;
    // onLiveClosed fires when it goes away, however that happens.
    AsyncFunction("startLiveScan") { (promise: Promise) in
      guard #available(iOS 16.0, *) else {
        promise.reject("ERR_RECEIPT_SCANNER", "Live scanning needs iOS 16 or later.")
        return
      }
      Task { @MainActor in
        guard self.live == nil else {
          promise.reject("ERR_RECEIPT_SCANNER", "The scanner is already open.")
          return
        }
        guard DataScannerViewController.isSupported, DataScannerViewController.isAvailable else {
          promise.reject("ERR_RECEIPT_SCANNER", "Live scanning isn't available on this iPhone.")
          return
        }
        guard let presenter = self.appContext?.utilities?.currentViewController() else {
          promise.reject("ERR_RECEIPT_SCANNER", "Couldn't open the camera.")
          return
        }
        let scanner = LiveScanner(
          onText: { [weak self] blocks in self?.sendEvent("onLiveText", ["blocks": blocks]) },
          onCode: { [weak self] data in self?.sendEvent("onLiveCode", ["data": data]) },
          onClosed: { [weak self] in
            self?.live = nil
            self?.sendEvent("onLiveClosed", [:])
          }
        )
        self.live = scanner
        scanner.present(from: presenter)
        promise.resolve()
      }
    }

    AsyncFunction("stopLiveScan") { (promise: Promise) in
      Task { @MainActor in
        if #available(iOS 16.0, *), let scanner = self.live as? LiveScanner {
          scanner.close()
        }
        promise.resolve()
      }
    }

    // Each result: the text, its box in 0–1 image coordinates with the origin
    // at the bottom left (Vision's convention), and Vision's confidence.
    AsyncFunction("recognize") { (path: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        guard let image = UIImage(contentsOfFile: path), let cgImage = image.cgImage else {
          promise.reject("ERR_RECEIPT_IMAGE", "Couldn't open that photo.")
          return
        }
        do {
          promise.resolve(try Self.readText(cgImage, CGImagePropertyOrientation(image.imageOrientation)))
        } catch {
          promise.reject("ERR_RECEIPT_OCR", error.localizedDescription)
        }
      }
    }

    // Resolves with one array of blocks per page scanned, or an empty array
    // when the person cancels.
    AsyncFunction("scanDocument") { (promise: Promise) in
      guard VNDocumentCameraViewController.isSupported else {
        promise.reject("ERR_RECEIPT_SCANNER", "This iPhone can't scan documents.")
        return
      }
      guard self.scanning == nil else {
        promise.reject("ERR_RECEIPT_SCANNER", "A scan is already open.")
        return
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_RECEIPT_SCANNER", "Couldn't open the camera.")
        return
      }
      let delegate = ScanDelegate { [weak self] outcome in
        guard let self, let pending = self.scanning else { return }
        self.scanning = nil
        switch outcome {
        case .cancelled:
          pending.promise.resolve([[[String: Any]]]())
        case .failed(let error):
          pending.promise.reject("ERR_RECEIPT_SCANNER", error.localizedDescription)
        case .scanned(let images):
          DispatchQueue.global(qos: .userInitiated).async {
            do {
              // Pages come out of the scanner upright and flattened.
              let pages = try images.compactMap { $0.cgImage }.map { try Self.readText($0, .up) }
              pending.promise.resolve(pages)
            } catch {
              pending.promise.reject("ERR_RECEIPT_OCR", error.localizedDescription)
            }
          }
        }
      }
      self.scanning = (promise, delegate)
      let camera = VNDocumentCameraViewController()
      camera.delegate = delegate
      presenter.present(camera, animated: true)
    }.runOnQueue(.main)
  }

  /** Text blocks off one image. Synchronous: call it off the main thread. */
  static func readText(_ cgImage: CGImage, _ orientation: CGImagePropertyOrientation) throws -> [[String: Any]] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    if #available(iOS 16.0, *) {
      // Revision 3 reads Japanese, Korean, Chinese, Thai, Vietnamese and
      // more, and can work out which one a receipt is in by itself.
      request.revision = VNRecognizeTextRequestRevision3
      request.automaticallyDetectsLanguage = true
    } else {
      // iOS 15 knows fewer scripts and can't detect them; ask for all of
      // the ones it has, English first since most receipts mix it in.
      request.recognitionLanguages = ["en-US", "fr-FR", "it-IT", "de-DE", "es-ES", "pt-BR", "zh-Hans", "zh-Hant"]
    }
    // A portrait camera photo is stored sideways with a flag saying so.
    // Vision only reads it upright if it's told about the flag.
    try VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:]).perform([request])
    return (request.results ?? []).compactMap { observation in
      guard let best = observation.topCandidates(1).first else { return nil }
      let box = observation.boundingBox
      return [
        "text": best.string,
        "x": Double(box.minX),
        "y": Double(box.minY),
        "width": Double(box.width),
        "height": Double(box.height),
        "confidence": Double(best.confidence),
      ]
    }
  }
}

/** Hears back from the document camera, closes it, and passes the pages on. */
final class ScanDelegate: NSObject, VNDocumentCameraViewControllerDelegate {
  enum Outcome {
    case scanned([UIImage])
    case cancelled
    case failed(Error)
  }

  private let done: (Outcome) -> Void

  init(done: @escaping (Outcome) -> Void) {
    self.done = done
  }

  func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
    // A long receipt can be scanned as a few pages, top to bottom.
    let images = (0..<scan.pageCount).map { scan.imageOfPage(at: $0) }
    controller.dismiss(animated: true)
    done(.scanned(images))
  }

  func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    controller.dismiss(animated: true)
    done(.cancelled)
  }

  func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
    controller.dismiss(animated: true)
    done(.failed(error))
  }
}

/**
 * Apple's live scanner in a full-screen sheet with a close button. Reports
 * every QR it sees, and the text in view about twice a second, as blocks in
 * the same shape `recognize` returns.
 */
@available(iOS 16.0, *)
@MainActor
final class LiveScanner: NSObject, DataScannerViewControllerDelegate {
  private let scanner: DataScannerViewController
  private let nav: UINavigationController
  private let onText: ([[String: Any]]) -> Void
  private let onCode: (String) -> Void
  private let onClosed: () -> Void
  private var lastText = Date.distantPast
  private var lastCode: String?
  private var closed = false

  init(
    onText: @escaping ([[String: Any]]) -> Void,
    onCode: @escaping (String) -> Void,
    onClosed: @escaping () -> Void
  ) {
    scanner = DataScannerViewController(
      recognizedDataTypes: [.text(), .barcode(symbologies: [.qr])],
      qualityLevel: .accurate,
      recognizesMultipleItems: true,
      isHighFrameRateTrackingEnabled: false,
      isPinchToZoomEnabled: true,
      isGuidanceEnabled: true,
      isHighlightingEnabled: true
    )
    nav = UINavigationController(rootViewController: scanner)
    self.onText = onText
    self.onCode = onCode
    self.onClosed = onClosed
    super.init()
    scanner.delegate = self
    scanner.title = "Hold the receipt or QR in view"
    scanner.navigationItem.leftBarButtonItem = UIBarButtonItem(
      systemItem: .close,
      primaryAction: UIAction { [weak self] _ in self?.close() }
    )
    nav.modalPresentationStyle = .fullScreen
  }

  func present(from presenter: UIViewController) {
    presenter.present(nav, animated: true) { [weak self] in
      guard let self else { return }
      do {
        try self.scanner.startScanning()
      } catch {
        self.close()
      }
    }
  }

  func close() {
    guard !closed else { return }
    closed = true
    scanner.stopScanning()
    nav.dismiss(animated: true)
    onClosed()
  }

  func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
    report(allItems)
  }

  func dataScanner(_ dataScanner: DataScannerViewController, didUpdate updatedItems: [RecognizedItem], allItems: [RecognizedItem]) {
    report(allItems)
  }

  func dataScanner(_ dataScanner: DataScannerViewController, becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable) {
    close()
  }

  private func report(_ items: [RecognizedItem]) {
    guard !closed else { return }
    for item in items {
      if case .barcode(let code) = item, let payload = code.payloadStringValue, payload != lastCode {
        lastCode = payload
        onCode(payload)
      }
    }
    let now = Date()
    guard now.timeIntervalSince(lastText) > 0.4 else { return }
    lastText = now
    let size = scanner.view.bounds.size
    guard size.width > 0, size.height > 0 else { return }
    // The scanner gives corners in view points from the top left; flip to
    // Vision's 0–1 from the bottom left so the same row grouping applies.
    let blocks: [[String: Any]] = items.compactMap { item in
      guard case .text(let text) = item else { return nil }
      let b = text.bounds
      let xs = [b.topLeft.x, b.topRight.x, b.bottomLeft.x, b.bottomRight.x]
      let ys = [b.topLeft.y, b.topRight.y, b.bottomLeft.y, b.bottomRight.y]
      guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max() else { return nil }
      return [
        "text": text.transcript,
        "x": Double(minX / size.width),
        "y": Double(1 - maxY / size.height),
        "width": Double((maxX - minX) / size.width),
        "height": Double((maxY - minY) / size.height),
      ]
    }
    if !blocks.isEmpty { onText(blocks) }
  }
}

extension CGImagePropertyOrientation {
  init(_ orientation: UIImage.Orientation) {
    switch orientation {
    case .up: self = .up
    case .upMirrored: self = .upMirrored
    case .down: self = .down
    case .downMirrored: self = .downMirrored
    case .left: self = .left
    case .leftMirrored: self = .leftMirrored
    case .right: self = .right
    case .rightMirrored: self = .rightMirrored
    @unknown default: self = .up
    }
  }
}
