
var HTTP = require('./http');
var UDP = require('./udp');

module.exports = {
  'http:': new HTTP(),
  'udp:': new UDP()
};

