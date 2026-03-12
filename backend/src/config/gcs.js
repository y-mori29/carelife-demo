const { Storage } = require('@google-cloud/storage');

const bucketName = process.env.GCS_BUCKET || '';
const storage = new Storage();
const bucket = bucketName ? storage.bucket(bucketName) : null;

module.exports = { storage, bucket, bucketName };
