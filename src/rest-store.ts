import * as Backbone from './backbone'
import * as _ from 'underscore'
import { mixins, define, Store } from '../type-r/src'
import { RestModel, RestCollection } from './rest'

const { $ } = Backbone;

@define({})
@mixins( Store )
export class RestStore extends RestModel {}

@define({})
export class LazyStore extends RestStore {
    _resolved  : {} = {}

    initialize(){
        this.each( ( element, name ) => {
            if( !element ) return;

            element.store = this;

            var fetch = element.fetch;

            if( fetch ){
                const self = this;
                element.fetch = function() {
                    return self._resolved[ name ] = fetch.apply( this, arguments );
                }
            }

            if( element instanceof RestCollection && element.length ){
                this._resolved[name] = true;
            }
        });
    }

    // fetch specified items, or all items if called without arguments.
    // returns jquery promise
    fetch( ...args : string[] ) : JQueryPromise< any > {
        var xhrs         = [],
            objsToFetch = args.length ? args : this.keys();

        for( let name of objsToFetch ){
            var attr = this.attributes[name];
            attr && attr.fetch && xhrs.push( attr.fetch() );
        }

        const promise = $ && $.when && $.when.apply( Backbone.$, xhrs );
        
        if( promise ){
            // Add abort method as wrapIO expects jqXHR object. 
            promise.abort = () => xhrs.forEach( xhr => xhr.abort && xhr.abort() );
            return promise;
        }
    }

    hasPendingIO() : boolean {
        return this._keys.some( key => {
            const value = this.attributes[ key ];
            return value && value.hasPendingIO && value.hasPendingIO();
        } );
    } 

    // fetch specified items, or all items if called without arguments.
    // returns first jquery promise.
    fetchOnce( ...args : string[] ) : JQueryPromise< any > {
        var xhr         = [],
            self        = this,
            objsToFetch = args.length ? args : this.keys();

        for( let name of objsToFetch ){
            var attr = self.attributes[ name ];
            xhr.push( self._resolved[ name ] || attr && attr.fetch && attr.fetch());
        }

        return $ && $.when && $.when.apply( Backbone.$, xhr );
    }

    clear( ...args : string[] ) : this {
        var objsToClear = args.length ? args : this.keys();

        for( let name of objsToClear ){
            var element = this.attributes[ name ];

            if( element instanceof RestCollection ){
                element.reset();
            }
            else if( element instanceof Store ){
                element.clear();
            }
            else if( element instanceof RestModel ){
                element.set( element.defaults() )
            }

            this._resolved[ name ] = false;
        }

        return this;
    }

    static define( props, staticProps ){
        var attributes = props.defaults || props.attributes;

        // add automatic fetching on first element's access
        _.each( attributes, ( Type : Function, name ) => {
            if( Type.has ){
                attributes[name] = Type.has
                    .get( function( value ){
                        if( !this._resolved[name] ) {
                            value.fetch && value.fetch();
                        }

                        return value;
                    })
                    .set( function( value ){
                        if( !value.length ){
                            const resolved = this._resolved || ( this._resolved = {} ); 
                            resolved[name] = false;
                        }
                        
                        return value;
                    })
            }  
        });

        return RestModel.define.call( this, props, staticProps );
    }
} 
    