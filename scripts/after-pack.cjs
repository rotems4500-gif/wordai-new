const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const rcedit = require('rcedit');
  const projectDir = String(context.packager?.projectDir || process.cwd());
  const productFilename = String(context.packager?.appInfo?.productFilename || 'WordFlow AI').trim();
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`);
  const iconPath = path.join(projectDir, 'assets', 'app-icon.ico');

  if (!fs.existsSync(exePath)) {
    throw new Error(`afterPack could not find packaged executable: ${exePath}`);
  }

  if (!fs.existsSync(iconPath)) {
    throw new Error(`afterPack could not find icon file: ${iconPath}`);
  }

  await rcedit(exePath, { icon: iconPath });
  console.log(`[afterPack] updated Windows executable icon: ${exePath}`);
};