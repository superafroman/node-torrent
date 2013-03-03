
/**
 * Object that represents a series of bits, i.e. 10001101.  Bits are stored
 * in order, left to right, for example
 * 
 *   bits:  10001101
 *   index: 01234567
 */
var BitField = function(/* length | buffer, length*/) {
  if (arguments.length !== 1 && arguments.length !== 2) {
    throw new Error('Must create BitField with either a length (Number) or a Buffer and a length.');
  }
  if (typeof arguments[0] === 'number') {
    this.bits = new Array(arguments[0]);
    for (var i=0; i<this.bits.length; i++) {
      this.bits[i] = 0;
    }
  } else {
    this.bits = arrayFromBuffer(arguments[0], arguments[1]);
  }
  this.length = this.bits.length;
};

function bufferFromArray(arr) {
  var buffer = new Buffer(Math.ceil(arr.length / 8));
  for (var i = 0; i < buffer.length; i++) {
    var base = i * 8;
    var byteValue = 0;
    for (var bit = 0; bit <= 7; bit++) {
      if (base+bit < arr.length && arr[base+bit]) {
        byteValue = byteValue | Math.pow(2, 7-bit);
      }
    }
    buffer[i] = byteValue;
  }
  return buffer;
}

function arrayFromBuffer(buffer, length) {
  var arr = new Array(length);
  for (var i = 0; i < buffer.length; i++) {
    var base = i * 8;
    var byteValue = buffer[i];
    for (var bit = 0; bit <= 7; bit++) {
      if (base+bit < arr.length) {
        arr[base+bit] = (byteValue & Math.pow(2, 7-bit)) > 0 ? 1 : 0;
      }
    }
  }
  return arr;
}

BitField.prototype.set = function(index) {
  this.bits[index] = 1;
};

BitField.prototype.unset = function(index) {
  this.bits[index] = 0;
};

BitField.prototype.toBuffer = function() {
  return bufferFromArray(this.bits);
};

BitField.prototype.isSet = function(index) {
  return this.bits[index];
};

BitField.prototype.or = function(rhs) {
  var length = Math.min(this.length, rhs.length);
  var ret = new BitField(length);
  for (var i = 0; i < length; i++) {
    ret.bits[i] = this.bits[i] | rhs.bits[i];
  }
  return ret;
};

BitField.prototype.xor = function(rhs) {
  var length = Math.min(this.length, rhs.length);
  var ret = new BitField(length);
  for (var i = 0; i < length; i++) {
    ret.bits[i] = this.bits[i] ^ rhs.bits[i];
  }
  return ret;
};

BitField.prototype.and = function(rhs) {
  var length = Math.min(this.length, rhs.length);
  var ret = new BitField(length);
  for (var i = 0; i < length; i++) {
    ret.bits[i] = this.bits[i] & rhs.bits[i];
  }
  return ret;
};

BitField.prototype.cardinality = function() {
  var count = 0;
  for (var i = 0; i < this.bits.length; i++) {
    if (this.bits[i]) {
      count++;
    }
  }
  return count;
};

BitField.prototype.setIndices = function() {
  var set = [];
  for (var i = 0; i < this.bits.length; i++) {
    if (this.bits[i]) {
      set.push(i);
    }
  }
  return set;
};

BitField.prototype.unsetIndices = function() {
  var unset = [];
  for (var i = 0; i < this.bits.length; i++) {
    if (!this.bits[i]) {
      unset.push(i);
    }
  }
  return unset;
};

BitField.prototype.setAll = function() {
  for (var i = 0; i < this.bits.length; i++) {
    this.set(i);
  }
};

module.exports = BitField;
