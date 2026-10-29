Pod::Spec.new do |s|
  s.name           = 'ReceiptOcr'
  s.version        = '1.0.0'
  s.summary        = 'On-device receipt text recognition with Apple Vision'
  s.description    = 'Reads receipt text with Vision, in any language Vision supports, and keeps where each line sits.'
  s.license        = 'MIT'
  s.author         = 'paisa.'
  s.homepage       = 'https://github.com/Swiftzz22/paisa-native'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/Swiftzz22/paisa-native' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
