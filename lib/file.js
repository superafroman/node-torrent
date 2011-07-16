
var fs = require('fs');

var LOGGER = require('log4js')().getLogger('file.js');

var File = function(path, length, offset) {
  this.path = path;
  this.length = length;
  this.offset = offset || 0;
  // TODO: stop using sync
  // TODO: allow resume (stop truncating, use r+ flag, read and validate contents)
  this.fd = fs.openSync(path, 'w+');
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
    var dataOffset = 0;
    var dataLength = piece.data.length;
    if (piece.position < this.offset) {
      dataOffset = this.offset - piece.position;
      dataLength -= dataOffset;
    }
    var pieceEnd = piece.position + dataLength;
    var fileEnd = this.offset + this.length;
    if (pieceEnd > fileEnd) {
      dataLength -= (pieceEnd - fileEnd);
    }
    var position = piece.position <= this.offset ? 0 : piece.position - this.offset;
    LOGGER.debug('file (' + this.path + ') contains piece, appending at position ' + position);
    fs.write(this.fd, piece.data, dataOffset, dataLength, position, function(err, written) {
      if (err) {
        callback(err);
      } else if (dataLength < piece.data.length) {
        callback(File.PARTIAL);
      } else {
        callback(File.FULL);
      }
    });
  } else {
    callback(File.NONE);
  }
};

File.PARTIAL = 'partial';
File.FULL = 'full';
File.NONE = 'none';

module.exports = File;
