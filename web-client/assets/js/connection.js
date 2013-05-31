angular.module('connection', ['ngResource']).
    factory('Torrents', function ($resource) {
        var Torrents = $resource('/torrentList', {});

        return Torrents;
    });