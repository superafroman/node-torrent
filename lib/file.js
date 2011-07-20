
var fs = require('fs');

var LOGGER = require('log4js').getLogger('file.js');

var File = function(filePath, length, offset, cb) {
  this.path = filePath;
  this.length = length;
  this.offset = offset || 0;

  var self = this;
  var path = require('path');
  path.exists(filePath, function(exists) {    
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

File.prototype.containsPiece = function(piece) {
  var fileEnd = this.offset + this.length;
  var pieceEnd = piece.position + piece.data.length;
  LOGGER.debug('this.offset = ' + this.offset + ', fileEnd = ' + fileEnd + ' piece.position = ' + piece.position + ', pieceEnd = ' + pieceEnd);
  return (this.offset >= piece.position && this.offset < pieceEnd) 
         || (fileEnd >= piece.position && fileEnd < pieceEnd)
         || (piece.position >= this.offset && piece.position < fileEnd)
         || (pieceEnd >= piece.position && pieceEnd < fileEnd);
};

File.prototype.appendPiece = function(piece, callback) {
  if (this.containsPiece(piece)) {
    var bounds = calculateBounds(this, piece);
    LOGGER.debug('file (' + this.path + ') contains piece, appending at position ' + bounds.position);
    fs.write(this.fd, piece.data, bounds.dataOffset, bounds.dataLength, bounds.position, function(err) {
      if (err) {
        callback(err);
      } else if (bounds.dataLength < piece.data.length) {
        callback(File.PARTIAL);
      } else {
        callback(File.FULL);
      }
    });
  } else {
    callback(File.NONE);
  }
};

File.prototype.readPiece = function(piece, callback) {
  if (this.containsPiece(piece)) {
    var bounds = calculateBounds(this, piece);
    LOGGER.debug('file (' + this.path + ') contains piece, reading data at position ' + bounds.position);
    fs.read(this.fd, piece.data, bounds.dataOffset, bounds.dataLength, bounds.position, function(err) {
      if (err) {
        callback(err);
      } else if (bounds.dataLength < piece.data.length) {
        callback(File.PARTIAL);
      } else {
        callback(File.FULL);
      }
    });
  } else {
    callback(File.NONE);
  }
};

function calculateBounds(self, piece) {
  var dataOffset = 0;
  var dataLength = piece.data.length;
  if (piece.position < self.offset) {
    dataOffset = self.offset - piece.position;
    dataLength -= dataOffset;
  }
  var pieceEnd = piece.position + dataLength;
  var fileEnd = self.offset + self.length;
  if (pieceEnd > fileEnd) {
    dataLength -= (pieceEnd - fileEnd);
  }
  var position = piece.position <= self.offset ? 0 : piece.position - self.offset;
  return {
    dataOffset: dataOffset,
    dataLength: dataLength,
    position: position
  };
}

File.PARTIAL = 'partial';
File.FULL = 'full';
File.NONE = 'none';

module.exports = File;
