const { execFile } = require('child_process');

function execFFmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', ...args], { windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        console.error('FFmpeg stderr:', stderr);
        return reject(new Error(stderr || String(err)));
      }
      resolve();
    });
  });
}

module.exports = { execFFmpeg };
