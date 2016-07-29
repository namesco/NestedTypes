import { sync, errorPromise, urlError, SyncOptions, LazyValue } from './sync'

import * as _ from 'underscore'
import * as Backbone from './backbone'

import { define, Model, Collection, tools } from 'type-r/src'
const { defaults } = tools;

interface RestOptions extends SyncOptions {
    wait? : boolean
    patch? : boolean
    reset? : boolean
}

@define({
    itemEvents : {
        destroy( model ){ this.remove( model ); }
    } 
})
export class RestCollection extends Collection {
    model : typeof RestModel
    url() : string { return this.model.prototype.urlRoot || ''; }

    // Fetch the default set of models for this collection, resetting the
    // collection when they arrive. If `reset: true` is passed, the response
    // data will be passed through the `reset` method instead of `set`.
    fetch( options : RestOptions ){
        options         = _.extend( { parse : true }, options );
        var success     = options.success;
        var collection  = this;
        options.success = function( resp ){
            var method = options.reset ? 'reset' : 'set';
            collection[ method ]( resp, options );
            if( collection._invalidate( options ) ) return false;

            if( success ) success.call( options.context, collection, resp, options );
            collection.trigger( 'sync', collection, resp, options );
        };

        wrapError( this, options );
        return _sync( 'read', this, options );
    }

    // Proxy `Backbone.sync` by default -- but override this if you need
    // custom syncing semantics for *this* particular model.
    sync(){
        return sync.apply( this, arguments );
    }
};

@define({
    collection : RestCollection,
    urlRoot : ''
})
export class RestModel extends Model {
    urlRoot : string

    // Fetch the model from the server, merging the response with the model's
    // local attributes. Any changed attributes will trigger a "change" event.
    fetch( options : RestOptions ){
        options         = _.extend( { parse : true }, options );
        var model       = this;
        var success     = options.success;
        options.success = function( serverAttrs ){
            model.set( serverAttrs, options );
            if( model._invalidate( options ) ) return false;

            if( success ) success.call( options.context, model, serverAttrs, options );
            model.trigger( 'sync', model, serverAttrs, options );
        };

        wrapError( this, options );
        return _sync( 'read', this, options );
    }

    // Proxy `Backbone.sync` by default -- but override this if you need
    // custom syncing semantics for *this* particular model.
    sync(){
        return sync.apply( this, arguments );
    }

    // Set a hash of model attributes, and sync the model to the server.
    // If the server returns an attributes hash that differs, the model's
    // state will be `set` again.
    save( key, val, options : RestOptions ){
        // Handle both `"key", value` and `{key: value}` -style arguments.
        var attrs;
        if( key == null || typeof key === 'object' ){
            attrs   = key;
            options = val;
        }
        else{
            (attrs = {})[ key ] = val;
        }

        options  = _.extend( { validate : true, parse : true }, options );
        var wait = options.wait;

        // If we're not waiting and attributes exist, save acts as
        // `set(attr).save(null, opts)` with validation. Otherwise, check if
        // the model will be valid when the attributes, if any, are set.
        if( attrs && !wait ){
            this.set( attrs, options );
        }

        if( this._invalidate( options ) ){
            if( attrs && wait ) this.set( attrs, options );
            return errorPromise( this.validationError );
        }

        // After a successful server-side save, the client is (optionally)
        // updated with the server-side state.
        var model       = this;
        var success     = options.success;
        var attributes  = this.attributes;
        options.success = function( serverAttrs ){
            // Ensure attributes are restored during synchronous saves.
            model.attributes = attributes;
            if( wait ) serverAttrs = _.extend( {}, attrs, serverAttrs );

            if( serverAttrs ){
                model.set( serverAttrs, options );
                if( model._invalidate( options ) ) return false;
            }

            if( success ) success.call( options.context, model, serverAttrs, options );
            model.trigger( 'sync', model, serverAttrs, options );
        };
        wrapError( this, options );

        // Set temporary attributes if `{wait: true}` to properly find new ids.
        if( attrs && wait ) this.attributes = _.extend( {}, attributes, attrs );

        var method = this.isNew() ? 'create' : (options.patch ? 'patch' : 'update');
        if( method === 'patch' && !options.attrs ) options.attrs = attrs;
        var xhr = _sync( method, this, options );

        // Restore attributes.
        this.attributes = attributes;

        return xhr;
    }

    // Destroy this model on the server if it was already persisted.
    // Optimistically removes the model from its collection, if it has one.
    // If `wait: true` is passed, waits for the server to respond before removal.
    destroy( options : RestOptions ){
        options     = options ? _.clone( options ) : {};
        var model   = this;
        var success = options.success;
        var wait    = options.wait;

        var destroy = function(){
            model.stopListening();
            model.trigger( 'destroy', model, model.collection, options );
        };

        options.success = function( resp ){
            if( wait ) destroy();
            if( success ) success.call( options.context, model, resp, options );
            if( !model.isNew() ) model.trigger( 'sync', model, resp, options );
        };

        var xhr = false;
        if( this.isNew() ){
            _.defer( options.success );
        }
        else{
            wrapError( this, options );
            xhr = _sync( 'delete', this, options );
        }
        if( !wait ) destroy();
        return xhr;
    }

    // Default URL for the model's representation on the server -- if you're
    // using Backbone's restful methods, override this to change the endpoint
    // that will be called.
    url(){
        var base =
                _.result( this, 'urlRoot' ) ||
                _.result( this.collection, 'url' ) ||
                urlError();
        if( this.isNew() ) return base;
        var id = this.get( this.idAttribute );
        return base.replace( /[^\/]$/, '$&/' ) + encodeURIComponent( id );
    }
}

function _sync( method, _this, options ){
    // Abort and pending IO request. Just one is allowed at the time.
    _this._xhr && _this._xhr.abort();

    return _this._xhr = _this.sync( method, _this, options )
        .always( function(){ _this.xhr = void 0; });
}

// Wrap an optional error callback with a fallback error event.
function wrapError( model, options ){
    var error     = options.error;
    options.error = function( resp ){
        if( error ) error.call( options.context, model, resp, options );
        model.trigger( 'error', model, resp, options );
    };
}