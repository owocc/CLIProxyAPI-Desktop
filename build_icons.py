#!/usr/bin/env python3
import os
import sys
import shutil
import subprocess

SRC = "/Users/owocc/Downloads/Gemini_Generated_Image_f9wp8kf9wp8kf9wp.jpeg"
BASE_DIR = os.path.abspath(os.path.dirname(__file__))

if not os.path.exists(SRC):
    print(f"Error: Source image not found at {SRC}")
    sys.exit(1)

print(f"==> 1. 读取完整新图标: {SRC}")

# 1. 生成 1024x1024 高清主图标 (build/appicon.png)
appicon_png = os.path.join(BASE_DIR, "build", "appicon.png")
temp_png_1024 = os.path.join(BASE_DIR, "build", "temp_1024.png")

subprocess.run(["sips", "-s", "format", "png", "--resampleWidth", "1024", SRC, "--out", temp_png_1024], check=True, stdout=subprocess.DEVNULL)

if shutil.which("magick"):
    subprocess.run(["magick", temp_png_1024, "-strip", "-quality", "95", appicon_png], check=True)
    os.remove(temp_png_1024)
else:
    shutil.move(temp_png_1024, appicon_png)

print(f"✓ 已生成主图标: build/appicon.png ({os.path.getsize(appicon_png)} bytes)")

# 2. 移除旧的 Wails 模板矢量图标目录 build/appicon.icon，防止编译时回退
old_appicon_icon = os.path.join(BASE_DIR, "build", "appicon.icon")
if os.path.exists(old_appicon_icon):
    shutil.rmtree(old_appicon_icon, ignore_errors=True)
    print("✓ 已移除旧模板矢量图标 build/appicon.icon")

# 3. 生成全套 macOS .icns (16x16 到 1024x1024)
iconset_dir = os.path.join(BASE_DIR, "build", "icons.iconset")
shutil.rmtree(iconset_dir, ignore_errors=True)
os.makedirs(iconset_dir, exist_ok=True)

icon_sizes = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
]

for filename, size in icon_sizes:
    out_path = os.path.join(iconset_dir, filename)
    subprocess.run(["sips", "-z", str(size), str(size), appicon_png, "--out", out_path], check=True, stdout=subprocess.DEVNULL)

darwin_icns = os.path.join(BASE_DIR, "build", "darwin", "icons.icns")
dmg_file_icns = os.path.join(BASE_DIR, "build", "darwin", "dmg-file-icon.icns")
dmg_file_png = os.path.join(BASE_DIR, "build", "darwin", "dmg-file-icon.png")

subprocess.run(["iconutil", "-c", "icns", iconset_dir, "-o", darwin_icns], check=True)
shutil.copyfile(darwin_icns, dmg_file_icns)
subprocess.run(["sips", "-z", "256", "256", appicon_png, "--out", dmg_file_png], check=True, stdout=subprocess.DEVNULL)
print(f"✓ 已生成 macOS 应用图标与 DMG 图标: build/darwin/icons.icns ({os.path.getsize(darwin_icns)} bytes)")

# 4. 生成 Windows 多分辨率 .ico (256, 128, 64, 48, 32, 24, 16)
win_ico = os.path.join(BASE_DIR, "build", "windows", "icon.ico")
ico_sizes = [256, 128, 64, 48, 32, 24, 16]
ico_pngs = []
for s in ico_sizes:
    p = os.path.join(iconset_dir, f"win_{s}.png")
    subprocess.run(["sips", "-z", str(s), str(s), appicon_png, "--out", p], check=True, stdout=subprocess.DEVNULL)
    ico_pngs.append(p)

if shutil.which("magick"):
    subprocess.run(["magick"] + ico_pngs + [win_ico], check=True)
    print(f"✓ 已生成 Windows 图标: build/windows/icon.ico ({os.path.getsize(win_ico)} bytes)")

# 5. 生成 iOS 图标
ios_icon = os.path.join(BASE_DIR, "build", "ios", "icon.png")
if os.path.exists(os.path.dirname(ios_icon)):
    shutil.copyfile(appicon_png, ios_icon)
    print("✓ 已更新 build/ios/icon.png")

# 6. 生成前端 Favicon (frontend/public/wails.png 与 dist)
frontend_icon = os.path.join(BASE_DIR, "frontend", "public", "wails.png")
subprocess.run(["sips", "-z", "128", "128", appicon_png, "--out", frontend_icon], check=True, stdout=subprocess.DEVNULL)
print("✓ 已更新前端 Favicon: frontend/public/wails.png")

frontend_dist_icon = os.path.join(BASE_DIR, "frontend", "dist", "wails.png")
if os.path.exists(os.path.dirname(frontend_dist_icon)):
    shutil.copyfile(frontend_icon, frontend_dist_icon)
    print("✓ 已同步前端编译包: frontend/dist/wails.png")

# 7. 更新已构建的本地 macOS .app 产物中的图标（使 Finder 和 Dock 立即生效）
bin_apps = [
    "bin/CPA Desktop.app",
    "bin/EasyCLIProxyAPI.app",
    "bin/EasyCLIProxyAPI.dev.app",
    "bin/easycliproxyapi-wails.dev.app",
]
for app_rel in bin_apps:
    app_res = os.path.join(BASE_DIR, app_rel, "Contents", "Resources")
    if os.path.exists(app_res):
        shutil.copyfile(darwin_icns, os.path.join(app_res, "icons.icns"))
        # 移除任何 Assets.car 以防覆盖
        assets_car = os.path.join(app_res, "Assets.car")
        if os.path.exists(assets_car):
            os.remove(assets_car)
        subprocess.run(["touch", os.path.join(BASE_DIR, app_rel)], check=False)
        print(f"✓ 已直接更新现有运行包图标: {app_rel}")

# 8. 清理临时图标集
shutil.rmtree(iconset_dir, ignore_errors=True)

print("\n=======================================================")
print("🎉 所有图标已全部 100% 替换为新的蓝天天蓝色设计并完成尺寸优化！")
print("=======================================================")
