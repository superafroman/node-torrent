angular.module('connection', ['ngResource']).
    factory('Torrents', function ($resource) {
        var Torrents = $resource('/torrentList', {
                update: { method: 'PUT' }
            }
        );

//        Torrents.prototype.update = function(cb) {
//            return Torrents.update({id: this._id.$oid},
//                angular.extend({}, this, {_id:undefined}), cb);
//        };

        return Torrents;
    });