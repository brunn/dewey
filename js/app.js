angular.module('Bookmarks', []).
  /* 
  * Filter split search string on fields conditions and after that 
  * uses them to build special expression for default AngularJS filter.
  *
  * For example:
  *
  * - When search string is "search string" - filter will try to find a match in any object field.
  * - When search string is "tag:search string" - filter will try to find a match only in object `tag` property.
  * - When search string is "search title tag:search tag" - filter will try to find a match for 'search tag' in object `tag` property
  * an 'search title' in `title` field.
  *
  */
  filter('bookmarksFilter', function($filter) {
    var standardFilter = $filter('filter');
    var orderBy = $filter('orderBy');
    return function(input, search, order) {
      var expression = {};

      var i = 0;
      var filterExpression = null;
      var filterString = "";

      if (search) {
        // Trying to parse search string by fields
        var pattern = '';
        var field = null; 
        var hasExpressions = false;
        for (var i = (search.length - 1); i >= 0; i--) {
          if (search[i]  === ':') {
            field = '';
            continue;
          } 

          if (field !== null) {
            if (search[i] === ' '){
              expression[field] = pattern;
              hasExpressions = true;
              field = null;
              pattern = '';
              continue;
            } else {
              field = search[i] + field;
              continue;
            }
          } else {
            pattern = search[i] + pattern;
          }
        }

        if (field !== null) {
          expression[field] = pattern;
          hasExpressions = true;
        } else {
          if (hasExpressions) {
            expression['title'] = pattern;
          } else {
            expression = pattern;
          }
        }
      }

      return orderBy(standardFilter(input, expression), order, order === 'date');
    } 
  });

/*
* Application controller.
*/
function AppCtrl($scope, $filter) {
  
  // Constant: default value of how many items we want to display on main page.
  var defaultTotalDisplayed = 30;

  $scope.searchText = ''; // Search text
  $scope.bookmarks = []; // All bookmarks
  $scope.orders = [ // Different sorting orders
                    {title:'Title', value: 'title'}, 
                    {title:'Date created', value: 'date'},
                    {title:'Url', value: 'url'}
                  ];
  $scope.currentOrder = $scope.orders[0]; // title is default sorting order

  // Edit tag dialog models
  $scope.bookmarkEdit = null; // selected bookmark (for dialog)
  $scope.newTag = ''; 

  // Maximum number of items currently displayed
  $scope.totalDisplayed = defaultTotalDisplayed;

  $scope.selectedIndex = 0;

  // Repository for custom tags
  var customTags = {};

  // Auto add showing bookmarks when user scroll to page down
  var loadMorePlaceholder = $('#loadMorePlaceholder').get(0);
  $(window).scroll(function () {
    if (getFilteredBookmarks().length > $scope.totalDisplayed) {
      if (loadMorePlaceholder.getBoundingClientRect().top <= window.innerHeight) {
        $scope.totalDisplayed += defaultTotalDisplayed;
        $scope.$apply();
      }
    }
  });

  var getAllPanels = function() {
    return $('#list-bookmarks div.panel');
  }

  var isElementInViewport = function(el) {
    var rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.left >= 0 && rect.bottom <= $(window).height() && rect.right <= $(window).width();
  }

  // Key down events handlers
  $(window).keydown(function(e) {
    var updated = false;
    if (e.which === 13) { // Enter press on page - go to the selected bookmark
      var result = getFilteredBookmarks();
      if (result.length > $scope.selectedIndex) {
        window.location.href = result[$scope.selectedIndex].url;
      } 
    } else if (e.which === 38) { // Up arrow key
      if ($scope.selectedIndex > 0) {
        $scope.selectedIndex--;
        updated = true;
      }
    } else if (e.which === 40) { // Down arrow key
      if (getAllPanels().length > $scope.selectedIndex + 1) {
        $scope.selectedIndex++;
        updated = true;
      }
    }
    if (updated) { // key up or key down pressed - select next element
      $scope.$apply();
      var panels = getAllPanels();
      var selectedElement = panels.get($scope.selectedIndex);
      if (selectedElement) {
        var rect = selectedElement.getBoundingClientRect(); // If element is not visible - scroll to it
        if (!(rect.top >= 0 && rect.left >= 0 && rect.bottom <= $(window).height() && rect.right <= $(window).width())) {
          $("body").animate({
            scrollTop: ($(panels.get($scope.selectedIndex)).offset().top - $(panels.get(0)).offset().top)
          }, 500);
        }
      }
      return false;
    }
  });

  // Place focus on input when show dialog
  $("#addTagModal").on('shown', function() {
    $(this).find("[autofocus]:first").focus();
  });

  // Get bookmarks we show on the page (in right order)
  var getFilteredBookmarks = function() {
    var bookmarksFilter = $filter('bookmarksFilter');
    return bookmarksFilter($scope.bookmarks, $scope.searchText, $scope.currentOrder.value);
  }

  // Recursive bookmarks traversal (we use folders as tags)
  var enumerateChildren = function(tree, tags) {
    if (tree) {
        angular.forEach(tree, function(c) {
            if (typeof c.url === 'undefined') {
                var t = angular.copy(tags);
                if (c.title) {
                    t.push(c.title);
                }
                enumerateChildren(c.children, t);
            } else {
                var bookmark = {
                    title: c.title,
                    url: c.url,
                    tag: [],
                    date: c.dateAdded,
                    id: c.id
                };

                angular.forEach(tags, function(tag) {
                  bookmark.tag.push({text: tag, custom: false});
                });

                if (customTags[bookmark.id]) {
                  angular.forEach(customTags[bookmark.id], function(tag){
                    bookmark.tag.push({text: tag, custom: true});
                  });
                }

                $scope.bookmarks.push(bookmark);
            }
        });
    }
  }

  // Get first custom tags and after this start bookmarks traversal.
  chrome.storage.sync.get('customTags', function(data) {
    if (data && data.customTags) {
      customTags = data.customTags;
    }

    chrome.bookmarks.getTree(function(tree) {
      var tags = [];
      enumerateChildren(tree, tags);
      $scope.$apply();
    });
  });

  // Set maximum total displayed items to default and scroll to top of the page
  var resetView = function() {
    $scope.totalDisplayed = defaultTotalDisplayed;
    $scope.selectedIndex = 0; 
    setTimeout(function() {
      window.scroll(0, 0);
    }, 10);
  };

  // When user change search string we scroll to top of the page and set total displayed items to default
  $scope.$watch('searchText', function() {
    resetView();
  });
 
  // On tag click we set search text
  $scope.selectTag = function(tag) {
    $scope.searchText = 'tag:' + tag;
  };

  // Change sorting order
  $scope.changeOrder = function(order) {
    $scope.currentOrder = order;
    resetView();
  };

  // Show modal dialog for adding tags
  $scope.addTag = function(bookmark) {
    $scope.bookmarkEdit = bookmark;
    $scope.newTag = '';
    $('#addTagModal').modal({
      keyboard: true,
      show: true
    });
    return false;
  };

  // Remove all custom tags for bookmark
  $scope.removeCustomTag = function(bookmark) {
    var tags = [];
    for (var i = bookmark.tag.length - 1; i > 0; i--) {
      if (bookmark.tag[i].custom) {
        bookmark.tag.splice(i, 1);
      }
    }
    if (customTags[bookmark.id]) {
      delete customTags[bookmark.id];
    }

    chrome.storage.sync.set({'customTags': customTags});
  };

  // Handler for saving custom tag for selected bookmark
  $scope.saveNewTag = function() {
    
    if ($scope.newTag && $scope.newTag.length > 0) {
      $scope.bookmarkEdit.tag.push({ text: $scope.newTag, custom: true});
      if (!customTags[$scope.bookmarkEdit.id]) {
        customTags[$scope.bookmarkEdit.id] = []
      }

      customTags[$scope.bookmarkEdit.id].push($scope.newTag);

      chrome.storage.sync.set({'customTags': customTags});
    }
    $('#addTagModal').modal('hide');
  };

  $scope.selectBookmark = function(index) {
    $scope.selectedIndex = index;
  }
}