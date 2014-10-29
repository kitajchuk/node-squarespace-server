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
            return phpjs.strftime( args, val );
        },
        "timesince": function ( val, args, ctx ) {
            return moment( val ).fromNow();
        },
        "item-classes": function ( val, args, ctx ) {
            return "";
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
        "image-meta": function ( val, args, ctx ) {
            return "";
        },
        "product-price": function ( val, args, ctx ) {
            return "";
        },
        "product-status": function ( val, args, ctx ) {
            return "";
        },
        "json": function ( val, args, ctx ) {
            return JSON.stringify( val, null, 4 );
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
                ret = fn( string, splits[ 1 ], context );
            }

            return ret;
        };
    }
};