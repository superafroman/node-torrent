
function nextTick(callback) {
  setTimeout(callback, 1);
}

exports.nextTick = nextTick;