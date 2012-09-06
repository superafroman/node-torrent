
function concat() {
  var length = 0;
  for (var i = 0; i < arguments.length; i++) {
    length += arguments[i].length;
  }
  var nb = new Buffer(length);
  var pos = 0;
  for (var i = 0; i < arguments.length; i++) {
    var b = arguments[i];
    b.copy(nb, pos, 0);
    pos += b.length;
  }
  return nb;
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

function fromInt(int) {
  var b = new Buffer(4);
  b[0] = int >> 24 & 0xff;
  b[1] = int >> 16 & 0xff;
  b[2] = int >> 8 & 0xff;
  b[3] = int & 0xff;
  return b;
}

function readInt(buffer, offset) {
  offset = offset || 0;
  return buffer[offset] << 24 |
         buffer[offset + 1] << 16 | 
         buffer[offset + 2] << 8 | 
         buffer[offset + 3]; 
}

function fromInt16(int) {
  var b = new Buffer(2);
  b[2] = int >> 8 & 0xff;
  b[3] = int & 0xff;
  return b;
}

function readInt16(buffer, offset) {
  offset = offset || 0;
  return buffer[offset + 2] << 8 | 
         buffer[offset + 3]; 
}

function slice(buffer, start, end) {
  if (start < 0) start = 0;
  if (!end || end > buffer.length) end = buffer.length;
  
  var b = new Buffer(end - start);
  buffer.copy(b, 0, start, end);
  return b;
}

exports.concat = concat;
exports.equal = equal;
exports.fromInt = fromInt;
exports.readInt = readInt;
exports.fromInt16 = fromInt16;
exports.readInt16 = readInt16;
exports.slice = slice;
