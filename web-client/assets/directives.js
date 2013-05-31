/**
 * ---- directives.js ----
 * User: David Yahalomi
 * Date: 21/05/13
 * Time: 23:08
 */

angular.module("template/popover/popover-html-popup.html", []).run(["$templateCache", function ($templateCache) {
    $templateCache.put("template/popover/popover-html-popup.html",
        "<div class=\"popover {{placement}}\" ng-class=\"{ in: isOpen(), fade: animation() }\">\n" +
            "  <div class=\"arrow\"></div>\n" +
            "\n" +
            "  <div class=\"popover-inner\">\n" +
            "      <div class=\"popover-content\" ng-bind-html-unsafe=\"content\"></div>\n" +
            "  </div>\n" +
            "</div>\n" +
            "");
}]);

angular.module("template/error/notfound.html", []).run(["$templateCache", function ($templateCache) {
    $templateCache.put("template/error/notfound.html",
        "<div>\nCould not found requested page.\n</div>\n");
}]);

angular.module('ui-directives',
        // dependencies
        [ 'ui.bootstrap.tooltip',
            'template/popover/popover-html-popup.html',
            'template/error/notfound.html' ])
    .directive('popoverHtmlPopup', function () {
        return {
            restrict: 'E',
            replace: true,
            scope: { content: '@', placement: '@', animation: '&', isOpen: '&' },
            templateUrl: 'template/popover/popover-html-popup.html',
            controller: 'GetTemplateCtrl',
            link: function (scope, element, attrs, getTemplateCtrl) {
                getTemplateCtrl.getTemplateByURL(attrs.content, function (data, status) {
                    if (status == 200){
                        scope.content = data;
                    } else {
                        scope.content = getTemplateCtrl.error();
                    }
                });
            }
        };
    })
    .directive('popoverHtml', ['$tooltip', function ($tooltip) {
        return $tooltip('popoverHtml', 'popoverHtml', 'click');
    }]);

function GetTemplateCtrl($log, $http, $templateCache) {
    this.error = function () {
        return $templateCache.get("template/error/notfound.html");
    };

    this.getTemplateByURL = function (url, finishCb) {
        $log.info(url);
        url = 'add.html';
        if (url) {
            $http({method: 'GET', url: url, cache: true}).
                success(finishCb).
                error(finishCb);
        } else {
            finishCb(this.error());
        }
    }
}