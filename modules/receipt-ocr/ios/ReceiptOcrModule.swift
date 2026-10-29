import ExpoModulesCore
import UIKit
import Vision

/**
 * Receipt text recognition on the phone, with Apple Vision. Free, offline,
 * and the photo never leaves the device.
 *
 * It replaces expo-text-extractor, which called Vision with its defaults:
 * English only, and the photo read without its orientation. A receipt from
 * Tokyo or Bangkok came back as noise, and a portrait camera photo was read
 * on its side. This also returns where each piece of text sits, so the JS
 * side can put "TOTAL" and "S$14.93" back on the same line.
 */
public class ReceiptOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReceiptOcr")

    Constants([
      "isSupported": true
    ])

    // Each result: the text, its box in 0–1 image coordinates with the origin
    // at the bottom left (Vision's convention), and Vision's confidence.
    AsyncFunction("recognize") { (path: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        guard let image = UIImage(contentsOfFile: path), let cgImage = image.cgImage else {
          promise.reject("ERR_RECEIPT_IMAGE", "Couldn't open that photo.")
          return
        }

        // Vision can report one failure twice (to the handler, then by
        // throwing), and a promise must only be settled once.
        var settled = false
        let request = VNRecognizeTextRequest { request, error in
          settled = true
          if let error = error {
            promise.reject("ERR_RECEIPT_OCR", error.localizedDescription)
            return
          }
          let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
          let blocks: [[String: Any]] = observations.compactMap { observation in
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
          promise.resolve(blocks)
        }
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
        let handler = VNImageRequestHandler(
          cgImage: cgImage,
          orientation: CGImagePropertyOrientation(image.imageOrientation),
          options: [:]
        )
        do {
          try handler.perform([request])
        } catch {
          if !settled {
            promise.reject("ERR_RECEIPT_OCR", error.localizedDescription)
          }
        }
      }
    }
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
