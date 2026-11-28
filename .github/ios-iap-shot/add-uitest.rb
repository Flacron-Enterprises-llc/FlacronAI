# Adds a UI test target (IAPShotUITests) + scheme "IAPShot" to the expo-prebuilt project. CI only, never committed output.
require "xcodeproj"
proj_path = ARGV[0]
proj = Xcodeproj::Project.open(proj_path)
app = proj.targets.find { |t| t.product_type == "com.apple.product-type.application" } or abort("no app target")
t = proj.new_target(:ui_test_bundle, "IAPShotUITests", :ios, "16.4")
group = proj.main_group.new_group("IAPShotUITests", "IAPShotUITests")
t.add_file_references([group.new_file("IAPReviewShot.swift")])
t.add_resources([group.new_file("FlacronAI.storekit")])
t.add_dependency(app)
t.build_configurations.each do |c|
  s = c.build_settings
  s["TEST_TARGET_NAME"] = app.name
  s["PRODUCT_NAME"] = "IAPShotUITests"
  s["ONLY_ACTIVE_ARCH"] = "YES"
  s["PRODUCT_BUNDLE_IDENTIFIER"] = "com.flacronenterprises.flacronai.iapshot"
  s["SWIFT_VERSION"] = "5.0"
  s["GENERATE_INFOPLIST_FILE"] = "YES"
  s["IPHONEOS_DEPLOYMENT_TARGET"] = "16.4"
  s["TARGETED_DEVICE_FAMILY"] = "1"
end
proj.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app)
scheme.add_test_target(t)
scheme.set_launch_target(app)
scheme.test_action.build_configuration = "Release"
scheme.save_as(proj_path, "IAPShot", true)
puts "added IAPShotUITests to #{app.name}"
