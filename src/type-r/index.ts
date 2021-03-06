/**
 * Export everything 
 */
export * from './object-plus'
export * from './collection'
export * from './relations'
export * from './record'

// Exported module itself is the global event bus.
import { Events } from './object-plus/'
export const { on, off, trigger, once, listenTo, stopListening, listenToOnce } = <any>Events;

import { Collection } from './collection'

// Define synonims for NestedTypes backward compatibility.
import { Record as Model } from './record' 
import { Mixable as Class } from './object-plus/'
export { Model, Class }; 

import { ChainableAttributeSpec } from './record'

/** Typeless attribute declaration with default value. */ 
export function value( x : any ) : ChainableAttributeSpec {
    return new ChainableAttributeSpec({ value : x });
}

/** Wrap model or collection method in transaction. */
export function transaction< F extends Function >( method : F ) : F {
    return <any>function( ...args ){
        let result;
        
        this.transaction( () => {
            result = method.apply( this, args );
        });
        
        return result;
    }
}