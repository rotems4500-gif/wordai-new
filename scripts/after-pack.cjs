const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const projectDir = String(context.packager?.projectDir || process.cwd());
  const productFilename = String(context.packager?.appInfo?.productFilename || 'WordFlow AI').trim();
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`);
  const iconPath = path.join(projectDir, 'assets', 'app-icon.ico');
  const resourcesPath = path.join(context.appOutDir, 'resources');
  const ocrSourceDir = path.join(projectDir, 'ocr-data');
  const ocrTargetDir = path.join(resourcesPath, 'ocr-data');

  if (!fs.existsSync(exePath)) {
    throw new Error(`afterPack could not find packaged executable: ${exePath}`);
  }

  if (!fs.existsSync(iconPath)) {
    throw new Error(`afterPack could not find icon file: ${iconPath}`);
  }

  if (fs.existsSync(ocrSourceDir)) {
    fs.mkdirSync(ocrTargetDir, { recursive: true });
    ['eng.traineddata', 'heb.traineddata'].forEach((fileName) => {
      const sourcePath = path.join(ocrSourceDir, fileName);
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, path.join(ocrTargetDir, fileName));
      }
    });
    console.log(`[afterPack] copied OCR language data to: ${ocrTargetDir}`);
  }

  try {
    const rcedit = require('rcedit');
    await rcedit(exePath, { icon: iconPath });
    console.log(`[afterPack] updated Windows executable icon: ${exePath}`);
  } catch (error) {
    console.warn(`[afterPack] skipped Windows executable icon update: ${error?.message || error}`);
  }
};