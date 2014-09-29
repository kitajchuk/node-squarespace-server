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
            
        },
        "excerpt?": function ( data, ctx, arg ) {
            
        },
        "comments?": function ( data, ctx, arg ) {
            
        },
        "disqus?": function ( data, ctx, arg ) {
            
        },
        "video?": function ( data, ctx, arg ) {
            
        },
        "even?": function ( data, ctx, arg ) {
            return (ctx._LookUpStack( arg ) % 2 == 0);
        },
        "odd?": function ( data, ctx, arg ) {
            return !(ctx._LookUpStack( arg ) % 2 == 0);
        },
        "equal?": function ( data, ctx, arg ) {
            console.log( "equal?", arg );
        },
        "collection?": function ( data, ctx, arg ) {
            
        },
        "external-link?": function ( data, ctx, arg ) {
            
        },
        "folder?": function ( data, ctx, arg ) {
            
        }
    };

module.exports = function ( predicate ) {
    // Only run if predicate is NOT a JSONT default internal
    if ( jsontPredicates.indexOf( predicate ) === -1 ) {
        // Wrapper function for passing along to correct predicate
        return function ( data, context ) {
            var split = predicate.split( " " ),
                pred = split[ 0 ],
                arg = split[ 1 ],
                ret = false,
                fn = sqsPredicates[ pred ];

            if ( typeof fn === "function" ) {
                ret = fn( data, context, arg );

            // .if variable...
            } else {
                console.log( ".if", predicate );
                ret = context.get( predicate );
            }

            return ret;
        };
    }
};