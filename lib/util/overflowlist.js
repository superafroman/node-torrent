
var OverflowList = function(overflow) {
  if (!overflow || typeof overflow !== 'number') {
    throw new Error('OverflowList requires an overflow size (Number) argument.');
  }
  this.overflow = overflow;
  this.list = [];
};

OverflowList.prototype = {
  push: function(object) {
    this.list.push(object);
    if (this.list.length > this.overflow) {
      this.list.shift();
    }
  },
  
  forEach: function(fn) {
    this.list.forEach(fn);
  },
  
  get length() {
    return this.list.length;
  }
};

module.exports = OverflowList;
