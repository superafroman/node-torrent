var vows = require('vows');
var assert = require('assert');

var OverflowList = require('../../lib/util/overflowlist');

vows.describe('OverflowList').addBatch({
  "A full OverflowList with overflow size 3": {
    topic: function() {
      var list = new OverflowList(3);
      list.push(1);
      list.push(2);
      list.push(3);
      return list;
    },
    "after calling `push(4)`": {
      topic: function(list) {
        list.push(4);
        return list;
      },
      "should contain `[2, 3, 4]`": function(result) {
        assert.equal(result.list[0], 2);
        assert.equal(result.list[1], 3);
        assert.equal(result.list[2], 4);
      },
      "should have length `3`": function(result) {
        assert.equal(result.length, 3);
      }
    }
  }
}).export(module);