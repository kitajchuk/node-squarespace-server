var jsonTemplate = require( "./jsontemplate" ),
    slug = require( "slug" ),
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
        "date": function ( arg, ctx ) {
            return "";
        },
        "timesince": function ( arg, ctx ) {
            return "";
        },
        "item-classes": function ( arg, ctx ) {
            return "";
        },
        "social-button": function ( arg, ctx ) {
            return "";
        },
        "comments": function ( arg, ctx ) {
            return "";
        },
        "comment-link": function ( arg, ctx ) {
            return "";
        },
        "comment-count": function ( arg, ctx ) {
            return "";
        },
        "like-button": function ( arg, ctx ) {
            return "";
        },
        "image-meta": function ( arg, ctx ) {
            return "";
        },
        "product-price": function ( arg, ctx ) {
            return "";
        },
        "product-status": function ( arg, ctx ) {
            return "";
        },
        "json": function ( arg, ctx ) {
            return JSON.parse( arg );
        },
        "json-pretty": function ( arg, ctx ) {
            return JSON.parse( arg );
        },
        "slugify": function ( arg, ctx ) {
            return slug( arg );
        },
        "url-encode": function ( arg, ctx ) {
            return encodeURI( encodeURIComponent( arg ) );
        },
        //"html",
        "htmlattr": function ( arg, ctx ) {
            return jsonTemplate.HtmlTagEscape( arg );
        },
        "activate-twitter-links": function ( arg, ctx ) {
            return "";
        },
        "safe": function ( arg, ctx ) {
            return "";
        }
    };

module.exports = function ( formatter ) {
    // Only run if formatter is NOT a JSONT default internal
    if ( jsontFormatters.indexOf( formatter ) === -1 ) {
        // Wrapper function for passing along to correct formatter
        return function ( string, context ) {
            var ret = false,
                fn = sqsFormatters[ formatter ];

            if ( typeof fn === "function" ) {
                ret = fn( string, context );
            }

            return ret;
        };
    }
};