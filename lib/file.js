
var fs = require('fs');

var LOGGER = require('log4js').getLogger('file.js');

var File = function(filePath, length, offset, cb) {
  this.path = filePath;
  this.length = length;
  this.offset = offset || 0;

  var self = this;
  fs.exists(filePath, function(exists) {
    if (exists) {
      var flag = 'r+';
    } else {
      flag = 'w+';
    }
    fs.open(filePath, flag, 0666, function(err, fd) {
      self.fd = fd;
      cb(err);
    });
  });
};

File.prototype.contains = function(pieceOffset, length) {
  var fileEnd = this.offset + this.length;
  var pieceEnd = pieceOffset + length;
  
  if (pieceOffset >= this.offset && pieceEnd <= fileEnd) {
    return File.FULL;
  }
  if ((this.offset >= pieceOffset && this.offset <= pieceEnd)
      || (fileEnd >= pieceOffset && fileEnd <= pieceEnd)) {
    return File.PARTIAL;
  }
  return File.NONE;
};

File.prototype.read = function(buffer, bufferOffset, pieceOffset, length, cb) {
  var self = this;
  var match = self.contains(pieceOffset, length);
  if (match === File.PARTIAL || match === File.FULL) {
    var bounds = calculateBounds(self, pieceOffset, length);
    self.busy = true;
    fs.read(self.fd, buffer, bufferOffset, bounds.dataLength, bounds.offset, function(err, bytesRead) {
      self.busy = false;
      cb(err, bytesRead);
    });
  }
  else {
    cb(null, 0);
  }
};

File.prototype.write = function(pieceOffset, data, cb) {
  var self = this;
  var match = self.contains(pieceOffset, data.length); // TODO: undefined
  if (match === File.PARTIAL || match === File.FULL) {
    var bounds = calculateBounds(self, pieceOffset, data.length);
    self.busy = true;
    fs.write(self.fd, data, bounds.dataOffset, bounds.dataLength, bounds.offset, function(err, bytesWritten) {
      self.busy = false;
      cb(err, bytesWritten);
    });
  }
  else {
    cb(null, 0);
  }
};

function calculateBounds(self, offset, length) {

  var dataStart = Math.max(self.offset, offset);
  var dataEnd = Math.min(self.offset+self.length, offset+length);

  return {
    dataOffset: dataStart - offset,
    dataLength: dataEnd - dataStart,
    offset: Math.max(offset-self.offset, 0)
  };
}

File.PARTIAL = 'partial';
File.FULL = 'full';
File.NONE = 'none';

module.exports = File;
