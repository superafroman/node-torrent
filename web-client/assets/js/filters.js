/**
 * ---- filters.js ----
 * User: David Yahalomi
 * Date: 13/05/13
 * Time: 22:22
 */
var filtersModule = angular.module('byte-filters', []);

filtersModule.filter('speed', ['$filter',function($filter) {
    var UnitMap = [
        'Bps',
        'KBps',
        'MBps',
        'GBps'
        // Stops here because the internet isn't that fast..
    ];

    return filter($filter, UnitMap);
}]);

filtersModule.filter('size', ['$filter', function($filter){
    var UnitList = [
        'Bytes',
        'KB',
        'MB',
        'GB',
        'TB',
        'PB'
    ];

    return filter($filter, UnitList);
}]);

function filter($filter, UnitMap) {
    return function (input) {
        var deviations = 0;
        for (; input > 1024; deviations++) {
            input /= 1024;
        }

        return cutDecimalDigits($filter, input, 2) + ' ' + UnitMap[deviations];
    };
};

function cutDecimalDigits($filter, input , numOfDigits) {
    input = $filter('number')(input, numOfDigits);
    return input;
}