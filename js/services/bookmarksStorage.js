define(
'services/bookmarksStorage',
[
  'underscore',
  'bookmarksApp'
],
function(_, bookmarksApp) { "use strict";

/*
* Add all custom tags from array to bookmark tags.
*/
var addCustomTags = function(bookmark, cTag) {
  if (cTag) {
    _.each(cTag, function(tag){
      bookmark.tag.push({text: tag, custom: true});
    });
  }
}

/*
* Recursive bookmarks traversal (we use folders as tags)
*/
var enumerateChildren = function(tree, tags, customTags, bookmarks) {
  if (tree) {
    _.each(tree, function(c) {
        if (!c.url) {
            var t = tags.slice();
            if (c.title) {
                t.push(c.title);
            }
            enumerateChildren(c.children, t, customTags, bookmarks);
        } else {
            var bookmark = {
                title: c.title,
                url: c.url,
                tag: [],
                date: c.dateAdded,
                id: c.id
            };

            _.each(tags, function(tag) {
              bookmark.tag.push({text: tag, custom: false});
            });

            addCustomTags(bookmark, customTags[bookmark.url]);

            bookmarks.push(bookmark);
        }
    });
  }
};

/*
* Add custom tags to bookmarks.
*/
var fillCustomTags = function(bookmarks, customTags) {
  _.each(bookmarks, function(bookmark) {
    // Remove all custom tags from bookmark first
    bookmarks.tag = _.filter(bookmarks.tag, function (t) { return t.custom === false });
    addCustomTags(bookmark, customTags[bookmark.url]);
  });
};

/*
* Bookmarks storage.
*/
var BookmarksStorage = function () {

  var bookmarks = [];
  var customTags = {};

  chrome.storage.onChanged.addListener(function(changes, namespace) {
    for (var key in changes) {
      if (changes.hasOwnProperty(key) && key === 'customTags') {
        customTags = changes[key].newValue;
        if (customTags) {
          fillCustomTags(bookmarks, customTags);
        }
      }
    };
  });

  /*
  * Get all bookmarks with all custom tags.
  */
  this.getAll = function(callback) {
    // Get first custom tags and after this start bookmarks traversal.
    chrome.storage.sync.get('customTags', function(data) {
      if (data && data.customTags) {
        customTags = data.customTags;
      }

      chrome.bookmarks.getTree(function(tree) {
        enumerateChildren(tree, [], customTags, bookmarks);
        callback(bookmarks);
      });
    });
  };

  this.update = function(bookmark, changes) {
    if (changes.title !== bookmark.title) {
      chrome.bookmarks.update(bookmark.id, { title: changes.title});
      bookmark.title = changes.title;
    }

    delete customTags[bookmark.url];
    bookmark.tag = _.filter(bookmark.tag, function(t) { return t.custom === false });
    if (changes.customTags && changes.customTags.length > 0) {
      customTags[bookmark.url] = changes.customTags;
      addCustomTags(bookmark, changes.customTags);
    }

    chrome.storage.sync.set({'customTags': customTags});
  };

  this.remove = function(bookmark) {
    delete customTags[bookmark.url];
    chrome.bookmarks.remove(bookmark.id);
  };
};

/*
* Bookmarks storage factory method.
*/
var BookmarksStorageFactory = function() {
  return new BookmarksStorage();
};

bookmarksApp.factory('bookmarksStorage', BookmarksStorageFactory);

});