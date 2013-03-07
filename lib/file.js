
var fs = require('fs');

var LOGGER = require('log4js').getLogger('file.js');

/**
 * Represents a file within the torrent.
 * 
 * @constructor
 * @this {File}
 * @param {string} path The path of the file on the local filesystem.
 * @param {number} length The length of the file.
 * @param {number} offset The offset of this file relative to the torrent.
 * @param {function} callback A function to call once the file has been created.
 */
var File = function(path, length, offset, callback) {
  this.path = path;
  this.length = length;
  this.offset = offset || 0;
  this._busy = false;

  var file = this;
  fs.exists(path, function(exists) {
    if (exists) {
      var flag = 'r+';
    } else {
      flag = 'w+';
    }
    fs.open(path, flag, 0666, function(error, fd) {
      file._fd = fd;
      callback(error);
    });
  });
};

/**
 * Check to see if this file contains data at a given offset.
 * 
 * @this {File}
 * @param {number} dataOffset The offset of this file within the torrent.
 * @param {number} length A function to call once the file has been created.
 * @return {string} One of File.NONE, File.PARTIAL or File.FULL, representing 
 * how much of the data overlaps with this file.
 */
File.prototype.contains = function(dataOffset, length) {

  var fileOffset = this.offset,
      fileEnd = this.offset + this.length,
      dataEnd = dataOffset + length;
  
  if (dataOffset >= fileOffset && dataEnd <= fileEnd) {
    return File.FULL;
  }
  if ((fileOffset >= dataOffset && fileOffset <= dataEnd)
      || (fileEnd >= dataOffset && fileEnd <= dataEnd)) {
    return File.PARTIAL;
  }
  return File.NONE;
};

/**
 * Read data from this file.
 * 
 * @this {File}
 * @param {Buffer} buffer A Buffer to write the read data to.
 * @param {number} bufferOffset The offset within the buffer to start writing data.
 * @param {number} dataOffset The offset of the data to read relative to the torrent.
 * @param {number} length The amount of data to read.
 * @param {function} callback A function to call with either an error or the number of bytes read.
 */
File.prototype.read = function(buffer, bufferOffset, dataOffset, length, cb) {
  
  var file = this,
      match = this.contains(dataOffset, length);

  if (match === File.PARTIAL || match === File.FULL) {
    var bounds = calculateBounds(this, dataOffset, length);
    this._busy = true;
    fs.read(this._fd, buffer, bufferOffset, bounds.dataLength, bounds.fileOffset, 
      function(error, bytesRead) {
        file._busy = false;
        callback(error, bytesRead);
      }
    );
  }
  else {
    callback(null, 0);
  }
};

/**
 * Write data to this file.
 * 
 * @this {File}
 * @param {number} dataOffset The offset of the data to write relative to the torrent.
 * @param {Buffer} data The data to write.
 * @param {function} callback A function to call with either an error or the number of bytes written.
 */
File.prototype.write = function(dataOffset, data, callback) {
  
  var file = this,
      match = this.contains(dataOffset, data.length);

  if (match === File.PARTIAL || match === File.FULL) {
    var bounds = calculateBounds(this, dataOffset, data.length);
    this._busy = true;
    fs.write(file._fd, data, bounds.dataOffset, bounds.dataLength, bounds.fileOffset, 
      function(error, bytesWritten) {
        file._busy = false;
        callback(error, bytesWritten);
      }
    );
  }
  else {
    callback(null, 0);
  }
};

function calculateBounds(file, offset, length) {

  var dataStart = Math.max(file.offset, offset);
  var dataEnd = Math.min(file.offset + file.length, offset + length);

  return {
    dataOffset: dataStart - offset,
    dataLength: dataEnd - dataStart,
    fileOffset: Math.max(offset - file.offset, 0)
  };
}

File.PARTIAL = 'partial';
File.FULL = 'full';
File.NONE = 'none';

module.exports = exports = File;
