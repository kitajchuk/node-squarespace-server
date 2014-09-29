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
        "item-classes": function ( arg, ctx ) {
            
        },
        "social-button": function ( arg, ctx ) {
            
        },
        "comments": function ( arg, ctx ) {
            
        },
        "comment-link": function ( arg, ctx ) {
            
        },
        "comment-count": function ( arg, ctx ) {
            
        },
        "like-button": function ( arg, ctx ) {
            
        },
        "image-meta": function ( arg, ctx ) {
            
        },
        "product-price": function ( arg, ctx ) {
            
        },
        "product-status": function ( arg, ctx ) {
            
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
            
        },
        "safe": function ( arg, ctx ) {
            
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