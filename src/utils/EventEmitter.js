var Logger = require("./Logger"),
    _ = require("lodash");
    
class EventEmitter {
    constructor() {
        
    }
    
    emit(name, args, cb, stores) {
        if (_.isNil(name) || !_.isString(name)) {
            throw new Error("Error on name");
        }
        
        if (_.isNil(args)) {
            args = {};
            cb = null;
        }
        
        if (_.isNil(cb)) {
            cb = null;
        }
        
        if (_.isFunction(args)) {
            cb = args;
            args = {};
        }
        
        if (!_.isNil(stores) && _.isArray(stores)) {
            this._stores = stores;
        }
        
        var command = name;
    
        Logger.info('Emitting store event ' + name);
        Logger.debug(args);
    
        // Send event to all the stores registered
        _.forEach(this._stores, function (fn) {
            if (_.isFunction(fn[command])) {
                fn[command](args, cb);
            } else if (_.isFunction(fn.all)) {
                args.name = name;
                fn.all(args, cb);
            }
        });
    }
}

module.exports = EventEmitter;