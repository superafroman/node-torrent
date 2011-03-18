
var fs = require('fs');

var File = function(path, length, offset) {
  this.path = path;
  this.length = length;
  this.offset = offset || 0;
  // TODO: stop using sync
  // TODO: allow resume (stop truncating, use r+ flag, read and validate contents)
  this.fd = fs.openSync(path, 'w+');
};

File.prototype.containsPiece = function(piece) {
  var begin = piece.begin;
  var end = piece.begin + piece.data.length;
  return (begin >= this.offset && begin < (this.offset + this.length)) ||
         (end >= this.offset && end < (this.offset + this.length));
};

File.prototype.appendPiece = function(piece, callback) {
  if (this.containsPiece(piece)) {
    var dataOffset = 0;
    var dataLength = piece.data.length;
    if (piece.begin < this.offset) {
      dataOffset = this.offset - piece.begin;
      dataLength -= dataOffset;
    }
    var pieceEnd = piece.begin + dataLength;
    var fileEnd = this.offset + this.length;
    if (pieceEnd > fileEnd) {
      dataLength -= (pieceEnd - fileEnd);
    }
    var position = piece.begin - this.offset;
    fs.write(this.fd, piece.data, dataOffset, dataLength, position, function(err) {
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
