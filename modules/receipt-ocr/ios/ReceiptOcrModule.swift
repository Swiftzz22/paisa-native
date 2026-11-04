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
 * Two ways in: a photo already taken (`recognize`), or Apple's document
 * camera (`scanDocument`), which finds the receipt in view, takes the shot
 * by itself once it's steady, and crops and flattens it before it's read.
 */
public class ReceiptOcrModule: Module {
  /** The scan in progress: its promise, and the delegate the camera holds weakly. */
  private var scanning: (promise: Promise, delegate: ScanDelegate)?

  public func definition() -> ModuleDefinition {
    Name("ReceiptOcr")

    Constants([
      "isSupported": true,
      // The document camera needs a real camera; false in the simulator.
      "canScanDocuments": VNDocumentCameraViewController.isSupported,
    ])

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
