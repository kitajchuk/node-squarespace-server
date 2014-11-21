/*!
 *
 * Squarespace formatters.
 *
 */
// http://jsont.squarespace.com/
// http://developers.squarespace.com/json-formatters/
var jsonTemplate = require( "./jsontemplate" ),
    slug = require( "slug" ),
    moment = require( "moment" ),
    phpjs = require( "phpjs" ),
    jsontFormatters = [
        "html",
        "htmltag",
        "html-attr-value",
        "str",
        "raw",
        "AbsUrl",
        "plain-url"
    ],
    sqsFormatters = {
        "date": function ( val, args, ctx ) {
            // Divide by 1000 since phpjs accounts for this:
            // PHP API expects UNIX timestamp (auto-convert to int)
            return phpjs.strftime( args, (parseInt( val, 10 ) / 1000) );
        },
        "timesince": function ( val, args, ctx ) {
            return moment( val ).fromNow();
        },
        "item-classes": function ( val, args, ctx ) {
            var classes = 'hentry';

            if ( val.promotedBlockType ) {
                classes += ' promoted promoted-block-' + val.promotedBlockType;
            }

            if ( val.categories ) {
                classes += val.categories.map(function ( value ) {
                    return ' category-' + slug( value.toLowerCase() );
                }).join(' ');
            }

            if ( val.tags ) {
                classes += val.tags.map(function ( value ) {
                    return ' tag-' + slug( value.toLowerCase() );
                }).join(' ');
            }

            if ( val.starred ) {
                classes += ' featured';
            }

            if ( val.structuredContent ) {
                if ( val.structuredContent.onSale ) {
                    classes += ' on-sale';
                }
            }

            classes += ' author-' + slug( val.author.displayName.toLowerCase() )
            classes += ' post-type-' + slug( val.recordTypeLabel.toLowerCase() );
            classes += ' article-index-' + ctx._LookUpStack( '@index' );

            return classes;
        },
        "image": function ( val, args, ctx ) {
            var focalPoint;

            if (val.mediaFocalPoint) {
              focalPoint = val.mediaFocalPoint.x + ',' + val.mediaFocalPoint.y;
            }

            return '<noscript><img src="' + val.assetUrl + '"  alt="' + val.filename + '" /></noscript><img alt="' + val.filename + '" class="' + (args[0] ? args[0] : 'thumb-image') + '" ' + (val.title ? 'alt="' + val.title + '" ' : '') + ' data-image="' + val.assetUrl + '" data-src="' + val.assetUrl + '" data-image-dimensions="' + val.originalSize + '" data-image-focal-point="' + focalPoint  + '" data-load="false" data-image-id="' + val.id + '" data-type="image">';
        },
        "image-meta": function ( val, args, ctx ) {
            var focalPoint;

            if (val.mediaFocalPoint) {
              focalPoint = val.mediaFocalPoint.x + ',' + val.mediaFocalPoint.y;
            }

            return 'data-src="' + val.assetUrl + '" data-image="' + val.assetUrl + '" data-image-dimensions="' + val.originalSize + '" data-image-focal-point="' + focalPoint  + '" alt="' + val.filename + '"';
        },
        "json": function ( val, args, ctx ) {
            return JSON.stringify( val );
        },
        "json-pretty": function ( val, args, ctx ) {
            return JSON.stringify( val, null, 4 );
        },
        "slugify": function ( val, args, ctx ) {
            return slug( val.toLowerCase() );
        },
        "url-encode": function ( val, args, ctx ) {
            return encodeURI( encodeURIComponent( val ) );
        },
        //"html",
        "htmlattr": function ( val, args, ctx ) {
            return jsonTemplate.HtmlTagEscape( val );
        },
        "htmltag": function ( val, args, ctx ) {
            return jsonTemplate.HtmlTagEscape( val );
        },
        "activate-twitter-links": function ( val, args, ctx ) {
            return val.replace( /(^|\s)@(\w+)/g, "$1<a href=\"http://twitter.com/$2\" target=\"_blank\">@$2</a>" );
        },
        "safe": function ( val, args, ctx ) {
            return phpjs.strip_tags( val );
        },
        "social-button": function ( val, args, ctx ) {
            return "";
        },
        "comments": function ( val, args, ctx ) {
            return "";
        },
        "comment-link": function ( val, args, ctx ) {
            return "";
        },
        "comment-count": function ( val, args, ctx ) {
            return "";
        },
        "like-button": function ( val, args, ctx ) {
            return "";
        },
        "product-price": function ( val, args, ctx ) {
            return "";
        },
        "product-status": function ( val, args, ctx ) {
            return "";
        },
        "pluralize": function ( val, args, ctx ) {
            return "";
        },
        "smartypants": function ( val, args, ctx ) {
            return "";
        }
    };

module.exports = function ( formatter ) {
    // Only run if formatter is NOT a JSONT default internal
    var splits = formatter.split( " " );

    if ( jsontFormatters.indexOf( formatter ) === -1 ) {
        // Wrapper function for passing along to correct formatter
        return function ( string, context ) {
            var ret = false,
                fn = sqsFormatters[ splits[ 0 ] ];

            if ( typeof fn === "function" ) {
                ret = fn( string, [].join.call( splits.slice( 1 ), " " ), context );
            }

            return ret;
        };
    }
};