// http://jsont.squarespace.com/
// http://jsont.squarespace.com/scoping-example/
// http://developers.squarespace.com/quick-reference/
var jsonTemplate = require( "./jsontemplate" ),
    jsontPredicates = [
        "singular",
        "plural",
        "singular?",
        "plural?",
        "Debug?"
    ],
    sqsPredicates = {
        "main-image?": function ( data, ctx, arg ) {
            return false;
        },
        "excerpt?": function ( data, ctx, arg ) {
            return false;
        },
        "comments?": function ( data, ctx, arg ) {
            return false;
        },
        "disqus?": function ( data, ctx, arg ) {
            return false;
        },
        "video?": function ( data, ctx, arg ) {
            return false;
        },
        "even?": function ( data, ctx, arg ) {
            return (ctx._LookUpStack( arg ) % 2 == 0);
        },
        "odd?": function ( data, ctx, arg ) {
            return !(ctx._LookUpStack( arg ) % 2 == 0);
        },
        "equal?": function ( data, ctx, arg1, arg2 ) {
            arg1 = ("" + ctx._LookUpStack( arg1 ));
            arg2 = ("" + arg2.replace( /"|'/g, "" ));

            // Support variable arg2 AND literal
            // {.equal? title collection.title}
            // {.equal? title "Title"}
            return (arg1 == arg2 || arg1 == ctx.get( arg2 ));
        },
        "collection?": function ( data, ctx, arg ) {
            return false;
        },
        "external-link?": function ( data, ctx, arg ) {
            return false;
        },
        "folder?": function ( data, ctx, arg ) {
            return false;
        },
        "location?": function ( data, ctx, arg ) {
            return false;
        },
        "event?": function ( data, ctx, arg ) {
            return false;
        }
    };

module.exports = function ( predicate ) {
    // Only run if predicate is NOT a JSONT default internal
    if ( jsontPredicates.indexOf( predicate ) === -1 ) {
        // Wrapper function for passing along to correct predicate
        return function ( data, context ) {
            var split = predicate.split( " " ),
                pred = split[ 0 ],
                arg1 = split[ 1 ],
                arg2 = split[ 2 ],
                ret = false,
                fn = sqsPredicates[ pred ];

            if ( typeof fn === "function" ) {
                ret = fn( data, context, arg1, arg2 );

            // .if condition
            } else {
                ret = context.get( predicate );
            }

            return ret;
        };
    }
};