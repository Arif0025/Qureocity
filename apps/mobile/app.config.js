const fs = require('node:fs');
const path = require('node:path');

const baseConfig = require('./app.json');
const firebaseConfigPath = path.join(__dirname, 'google-services.json');

module.exports = () => {
  const config = { ...baseConfig.expo };
  const android = { ...config.android };

  // Enable the native FCM registration config automatically once the file
  // from Firebase is added, while keeping Expo config valid beforehand.
  if (fs.existsSync(firebaseConfigPath)) {
    android.googleServicesFile = './google-services.json';
  } else {
    delete android.googleServicesFile;
  }

  return { ...config, android };
};
