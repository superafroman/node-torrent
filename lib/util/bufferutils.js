
function concat(b1, b2) {
  var b = new Buffer(b1.length + b2.length);
  b1.copy(b, 0, 0);
  b2.copy(b, b1.length, 0);
  return b;
}

function equal(b1, b2) {
  if (b1.length != b2.length) {
    return false;
  }
  for (var i = 0; i < b1.length; i++) {
    if (b1[i] != b2[i]) {
      return false;
    }
  }
  return true;
}

function readInt(buffer, offset) {
  offset = offset || 0;
  return buffer[offset] << 24 |
         buffer[offset + 1] << 16 | 
         buffer[offset + 2] << 8 | 
         buffer[offset + 3]; 
}

function fromInt(int) {
  var b = new Buffer(4);
  b[0] = int >> 24 & 0xff;
  b[1] = int >> 16 & 0xff;
  b[2] = int >> 8 & 0xff;
  b[3] = int & 0xff;
  return b;
}

exports.concat = concat;
exports.equal = equal;
exports.fromInt = fromInt;
exports.readInt = readInt;