/**
 * @file MongoPortable.js - based on Monglo ({@link https://github.com/Monglo}) by Christian Sullivan <cs@euforic.co> | Copyright (c) 2012
 * @version 0.0.1
 * 
 * @author Eduardo Astolfi <eduardo.astolfi91@gmail.com>
 * @copyright 2016 Eduardo Astolfi <eduardo.astolfi91@gmail.com>
 * @license MIT Licensed
 */
var _ = require('lodash'),
    ObjectId = require('./ObjectId'),
    Collection = require('./Collection'),
    Logger = require("./utils/Logger");
    
/**
 * MongoPortable
 * 
 * @module MongoPortable
 * @constructor
 * @since 0.0.1
 * 
 * @classdesc Portable database with persistence and MongoDB-like API
 * 
 * @param {string} databaseName - Name of the database.
 */
var MongoPortable = function(databaseName) {
    if (!(this instanceof MongoPortable)) return new MongoPortable(databaseName);
    
    // Check ddbb name format
    _validateDatabaseName(databaseName);

    // Initializing variables
    this._collections = {};
    this._stores = [];

    if (!MongoPortable.connections) {
        MongoPortable.connections = {};
    }

    //Temp patch until I figure out how far I want to take the implementation;
    // FIXME
    if (MongoPortable.connections[databaseName]) {
        throw new Error('db name already in use');
    }

    this.databaseName = databaseName;

    MongoPortable.connections[databaseName] = new ObjectId();
};

/**
 * Connection Pool
 * 
 * @memberof MongoPortable
 * @static
 */
MongoPortable.connections = {};

// MongoPortable.prototype.__proto__ = EventEmitter.proto;

/**
 * Version Number
 * 
 * @memberof MongoPortable
 * @static
 */
MongoPortable.version = '0.0.1';

/**
 * Emits an event over all the stores loaded
 * 
 * @method MongoPortable#_emit
 * @private
 * 
 * @param  {String} name - Name of the event to fire
 * @param  {Object} args - Parameters to pass with the event
 * @param {Function} [cb=null] - Callback function to be called at the end with the results
 */
MongoPortable.prototype._emit = function(name, args, cb) {
    var self = this;
    var command = name;

    // Send event to all the stores registered
    _.forEach(self._stores, function(fn) {
        if ('function' === typeof fn[command]) {
            fn[command](args, cb);
        } else if ('function' === typeof fn.all) {
            args.name = name;
            fn.all(args, cb);
        }
    });
};

/**
 * Middleware functions
 * 
 * @param  {String} name - Name of the middleware:
 *      <ul>
 *          <li>"store": Add a custom store</li>
 *      </ul>
 * @param  {Function} fn - Function to implement the middleware
 */

MongoPortable.prototype.use = function(name, fn) {
    switch(name) {
        case 'store':
            this._stores.push(fn);
            break;
    }
};

/**
 * Adds a custom stores for remote and local persistence
 *
 * @param {Object|Function} store - The custom store
 * 
 * @returns {MongoPortable} this - The current Instance
 */
MongoPortable.prototype.addStore = function (store) {
    if (_.isNil(store)) throw new Error("store must be included");
    
    if (_.isFunction(store)) {
        this._stores.push(new store());
    } else if (_.isPlainObject(store)) {
        this._stores.push(store);
    } else {
        throw new Error("store must be a function or object");
    }
    

    return this;
};

/**
 * Returns a cursor to all the collection information.
 *
 * @param {String} [collectionName=null] - the collection name we wish to retrieve the information from.
 * @param {Function} [callback=null] - Callback function to be called at the end with the results
 * 
 * @returns {Array}
 * 
 * @todo Not implemented yet
 */
MongoPortable.prototype.collectionsInfo = function(collectionName, callback) {
    throw new Error("Not implemented yet");
};

/**
 * Alias for {@link MongoPortable#collections}
 * 
 * @method MongoPortable#fetchCollections
 */
MongoPortable.prototype.fetchCollections = function(options, callback) {
    return this.collections(options, callback);
};

/**
 * Get the list of all collection for the specified db
 *
 * @method MongoPortable#collections
 * 
 * @param {Object} [options] - Additional options
 * 
 * @param {Boolean} [options.namesOnly=false] - Return only the collections names
 * @param {String|Array} [options.collectionName=null] - The collection name we wish to filter by
 * 
 * @param {Function} [callback=null] - Callback function to be called at the end with the results
 *
 * @return {Array} 
 */
MongoPortable.prototype.collections = function(options, callback) {
    if (_.isNil(callback) && _.isFunction(options)) {
        callback = options;
    }
    
    if (_.isNil(options)) options = {};
    
    var self = this;
    
    var collectionList = [];
    for (var name in self._collections) {
        // Only add the requested collections //TODO Add array type
        if (options.collectionName) {
            if (name.toLowerCase() === options.collectionName.toLowerCase()) {
                if (options.namesOnly) {
                    collectionList.push(name);
                } else {
                    collectionList.push(self._collections[name]);
                }
            }
        } else {
            if (options.namesOnly) {
                collectionList.push(name);
            } else {
                collectionList.push(self._collections[name]);
            }
        }
    }

    if (callback) callback(collectionList);
    
    return collectionList;
};

 /**
 * Get the list of all collection names for the specified db, 
 *  by calling MongoPortable#collections with [options.namesOnly = true]
 *
 * @method MongoPortable#collectionNames
 * 
 * @param {Object} [options] - Additional options.
 * 
 * @param {String|Array} [options.collectionName=null] - The collection name we wish to filter by.
 * 
 * @param {Function} [callback=null] - Callback function to be called at the end with the results
 *
 * @return {Array}
 * 
 * {@link MongoPortable#collections}
 */
MongoPortable.prototype.collectionNames = function(options, callback) {
    if (_.isNil(callback) && _.isFunction(options)) {
        callback = options;
    }
    
    if (_.isNil(options)) options = {};
    
    if (!options.namesOnly) options.namesOnly = true;
    
    return this.collections(options, callback);
};


/**
 * Creates a collection on a server pre-allocating space, need to create f.ex capped collections.
 * 
 * @method MongoPortable#collection
 * 
 * @param {String} collectionName - the collection name we wish to access.
 * @param {Object} [options] - returns option results.
 * 
 * @param {Boolean|Object} [options.safe=false] Executes with a getLastError command returning the results of the command on MongoMonglo:
 *      <ul>
 *          <li>true</li>
 *          <li>false</li>
 *          <li>{ w: {Number}, wtimeout: {Number}}</li>
 *          <li>{ fsync: true }</li>
 *      </ul>
 * @param {Boolean} [options.serializeFunctions=false] - Serialize functions on the document.
 * @param {Boolean} [options.raw=false] - Perform all operations using raw bson objects.
 * @param {Object} [options.pkFactory=null] - Object overriding the basic ObjectId primary key generation.
 * @param {Boolean} [options.capped=false] - Create a capped collection.
 * @param {Number} [options.size=4096] - The size of the capped collection in bytes.
 * @param {Number} [options.max=500] - The maximum number of documents in the capped collection.
 * @param {Boolean} [options.autoIndexId=false] - Create an index on the _id field of the document, not created automatically on capped collections.
 * @param {String} [options.readPreference=ReadPreference.PRIMARY] - Te prefered read preference:
 *      <ul>
 *          <li>ReadPreference.PRIMARY</li>
 *          <li>ReadPreference.PRIMARY_PREFERRED</li>
 *          <li>ReadPreference.SECONDARY</li>
 *          <li>ReadPreference.SECONDARY_PREFERRED</li>
 *          <li>ReadPreference.NEAREST</li>
 *      </ul>
 * 
 * @param {Function} [callback=null] - Callback function to be called at the end with the results
 * 
 * @fires {@link MongoStore#createCollection}
 * 
 * @returns {Collection}
 */
MongoPortable.prototype.collection = function(collectionName, options, callback) {
    var self = this;
    var existing = false;
    // var collection;
    // var collectionFullName =  self.databaseName + "." + collectionName;

    if (_.isFunction(options)){
        callback = options;
        options = {};
    } else {
        options = options || {};
    }
    
    // Collection already in memory, lets create it
    if (self._collections[collectionName]) {
        self._emit(
            'createCollection',
            {
                connection: self,
                collection: self._collections[collectionName]
            }
        );

        existing = true;
    } else {
        self._collections[collectionName] = new Collection(self, collectionName, self.pkFactory, options);
        self._emit(
            'createCollection',
            {
                connection: self,
                collection: self._collections[collectionName]
            }
        );
    }
    
    if (!existing) {
        // Letting access the collection by MongoPortable.<COL_NAME>
        Object.defineProperty(MongoPortable.prototype, collectionName, {
            enumerable : true,
            configurable : true,
            get: function () {
                return self._collections[collectionName];
            },
            set: function (v) {
                self._collections[collectionName] = v;
            }
        });
    }
    
    // return self._collections[collectionName];
    if (callback) callback(self._collections[collectionName]);

    return self._collections[collectionName];
};

/**
 * Alias for {@link MongoPortable#collection}
 * 
 * @method MongoPortable#createCollection
 */
MongoPortable.prototype.createCollection = MongoPortable.prototype.collection;

/**
 * Drop a collection from the database, removing it permanently. New accesses will create a new collection.
 * 
 * @method MongoPortable#dropCollection
 *
 * @param {String} collectionName - The name of the collection we wish to drop.
 * @param {Function} [callback=null] - Callback function to be called at the end with the results
 * 
 * @returns {Boolean} "true" if dropped successfully
 */
MongoPortable.prototype.dropCollection = function(collectionName, callback) {
    var self = this;

    if (self._collections[collectionName]) {
        // Drop the collection
        this._emit(
            'dropCollection',
            {
                conn: this,
                collection: self._collections[collectionName]
            }
        );
        
        delete self._collections[collectionName];
        
        if (callback && _.isFunction(callback)) callback();
        
        return true;
    } else {
        var msg = "No collection found";
        
        Logger.error(msg);
        
        if (callback && _.isFunction(callback)) callback(new Error(msg));
        
        return false;
    }
};

/**
 * Rename a collection.
 *
 * @method MongoPortable#renameCollection
 * 
 * @param {String} fromCollection - The name of the current collection we wish to rename.
 * @param {String} toCollection - The new name of the collection.
 * @param {Function} [callback=null] - Callback function to be called at the end with the results
 * 
 * @returns {Boolean|Collection} The collection if renamed successfully or false if not
 */
MongoPortable.prototype.renameCollection = function(fromCollection, toCollection, callback) {
    var self = this;

    if (_.isString(fromCollection) && _.isString(toCollection) && fromCollection !== toCollection) {
        // Execute the command, return the new renamed collection if successful
        Collection.checkCollectionName(toCollection);
        
        if (self._collections[fromCollection]) {
            this._emit(
                'renameCollection',
                {
                    conn: self,
                    from: fromCollection,
                    to: toCollection
                }
            );
            
            var renamed = self._collections[fromCollection].rename(toCollection);
            self._collections.renameProperty(fromCollection, toCollection);
            self.renameProperty(fromCollection, toCollection);
            
            if (callback && _.isFunction(callback)) callback(null, renamed);
            
            return renamed;
        } else {
            let msg = "No collection found";
            
            Logger.error(msg);
            
            if (callback && _.isFunction(callback)) callback(new Error(msg), null);
            
            return false;
        }
    } else {
        let msg = "The params are invalid";
        
        Logger.error(msg);
        
        if (callback && _.isFunction(callback)) callback(new Error(msg), null);
        
        return false;
    }
};


/**
 * Creates an index on the collection.
 * 
 * @method MongoPortable#createIndex
 *
 * @param {String} collectionName - Name of the collection to create the index on.
 * @param {Object} fieldOrSpec - FieldOrSpec that defines the index.
 * @param {Object} [options] - Additional options during update.
 * 
 * @param {Boolean|Object} [options.safe=false] Executes with a getLastError command returning the results of the command on MongoMonglo:
 *      <ul>
 *          <li>true</li>
 *          <li>false</li>
 *          <li>{ w: {Number}, wtimeout: {Number}}</li>
 *          <li>{ fsync: true }</li>
 *      </ul> 
 * @param {Boolean} [options.unique=false] - Creates an unique index
 * @param {Boolean} [options.sparse=false] - Creates a sparse index
 * @param {Boolean} [options.background=false] - Creates the index in the background, yielding whenever possible
 * @param {Boolean} [options.dropDups=false] - A unique index cannot be created on a key that has pre-existing duplicate values. If you would like to create the index anyway, keeping the first document the database indexes and deleting all subsequent documents that have duplicate value
 * @param {Number} [options.min=null] - For geospatial indexes set the lower bound for the co-ordinates
 * @param {Number} [options.max=null] - For geospatial indexes set the high bound for the co-ordinates
 * @param {Number} [options.v=null] - Specify the format version of the indexes
 * @param {Number} [options.expireAfterSeconds=null] - Allows you to expire data on indexes applied to a data (MongoDB 2.2 or higher)
 * @param {String} [options.name=null] - Override the autogenerated index name (useful if the resulting name is larger than 128 bytes)
 * 
 * @param {Function} [callback=null] - Callback function to be called at the end with the results
 */
MongoPortable.prototype.createIndex = function(collectionName, fieldOrSpec, options, callback) {
    throw new Error('Not implemented yet!');
};

/**
 * Ensures that an index exists, if it does not it creates it
 * 
 * @method MongoPortable#ensureIndex
 *
 * @param {String} collectionName - Name of the collection to create the index on.
 * @param {Object} fieldOrSpec - FieldOrSpec that defines the index.
 * @param {Object} [options] - Additional options during update.
 * 
 * @param {Boolean|Object} [options.safe=false] - Executes with a getLastError command returning the results of the command on MongoMonglo:
 *      <ul>
 *          <li>true</li>
 *          <li>false</li>
 *          <li>{ w: {Number}, wtimeout: {Number}}</li>
 *          <li>{ fsync: true }</li>
 *      </ul>
 * @param {Boolean} [options.unique=false] - Creates an unique index
 * @param {Boolean} [options.sparse=false] - Creates a sparse index
 * @param {Boolean} [options.background=false] - Creates the index in the background, yielding whenever possible
 * @param {Boolean} [options.dropDups=false] - A unique index cannot be created on a key that has pre-existing duplicate values. If you would like to create the index anyway, keeping the first document the database indexes and deleting all subsequent documents that have duplicate value
 * @param {Number} [options.min] - For geospatial indexes set the lower bound for the co-ordinates
 * @param {Number} [options.max] - For geospatial indexes set the high bound for the co-ordinates
 * @param {Number} [options.v] - Specify the format version of the indexes
 * @param {Number} [options.expireAfterSeconds] - Allows you to expire data on indexes applied to a data (MongoDB 2.2 or higher)
 * @param {String} [options.name] - Override the autogenerated index name (useful if the resulting name is larger than 128 bytes)
 * 
 * @param {Function} [callback=null] - Callback function to be called at the end with the results
 */
MongoPortable.prototype.ensureIndex = function(collectionName, fieldOrSpec, options, callback) {
    throw new Error('Not implemented yet!');
};

/**
 * Drop an index on a collection.
 * 
 * @method MongoPortable#dropIndex
 *
 * @param {String} collectionName - The name of the collection where the command will drop an index.
 * @param {String} indexName - Name of the index to drop.
 * @param {Function} [callback=null] - Callback function to be called at the end with the results
 */
MongoPortable.prototype.dropIndex = function(collectionName, indexName, callback) {
    throw new Error('Not implemented yet!');
};

/**
 * Reindex all indexes on the collection
 * Warning: "reIndex" is a blocking operation (indexes are rebuilt in the foreground) and will be slow for large collections.
 * 
 * @method MongoPortable#reIndex
 *
 * @param {String} collectionName - The name of the collection to reindex
 * @param {Function} [callback=null] - Callback function to be called at the end with the results
 **/
MongoPortable.prototype.reIndex = function(collectionName, callback) {
    throw new Error('Not implemented yet!');
};

/**
 * Retrieves this collections index info.
 * 
 * @method MongoPortable#indexInformation
 *
 * @param {String} collectionName - The name of the collection.
 * @param {Object} [options] Additional options during update.
 * 
 * @param {Boolean} [full=false] - Returns the full raw index information.
 * @param {String} [readPreference] - The preferred read preference ((Server.PRIMARY, Server.PRIMARY_PREFERRED, Server.SECONDARY, Server.SECONDARY_PREFERRED, Server.NEAREST).
 * 
 * @param {Function} [callback=null] - Callback function to be called at the end with the results
 */
MongoPortable.prototype.indexInformation = function(collectionName, options, callback) {
    throw new Error('Not implemented yet!');
};

/**
 * Drop the whole database.
 * 
 * @method MongoPortable#dropDatabase
 *
 * @param {Function} [callback=null] - Callback function to be called at the end with the results
 * 
 * @return {Boolean} "true" if dropped successfully
 */
MongoPortable.prototype.dropDatabase = function(callback) {
    if (MongoPortable.connections[this.databaseName]) {
        this._emit(
            'dropDatabase',
            {
                conn: this
            }
        );
        
        delete MongoPortable.connections[this.databaseName];
        
        this._collections = [];
        this._stores = [];
        
        if (callback && _.isFunction(callback)) callback(null, true);
        
        return true;
    } else {
        let msg = 'That database no longer exists';
        
        Logger.error(msg);
        
        if (callback && _.isFunction(callback)) callback(new Error(msg), false);
        
        return false;
    }
};

/**
 * Dereference a dbref, against a db
 *
 * @param {DBRef} dbRef db reference object we wish to resolve.
 * @param {Function} [callback=null] Callback function to be called at the end with the results
 * 
 * @todo Not implemented yet
 * 
 * @ignore
 */
MongoPortable.prototype.dereference = function(dbRef, callback) {
    // TODO
    // var db = this;

    // // If we have a db reference then let's get the db first
    // if (dbRef.db !== null) db = this.db(dbRef.db);

    // // Fetch the collection and find the reference
    // var collection = Monglo.collection(dbRef.namespace);

    // collection.findOne({'_id':dbRef.oid}, function(err, result) {
    //     callback(err, result);
    // });
};


/**
 * Validates the database name
 * 
 * @method MongoPortable#_validateDatabaseName
 * @private
 * 
 * @param {String} databaseName - The name of the database to validate
 * 
 * @return {Boolean} "true" if the name is valid
 */
var _validateDatabaseName = function(databaseName) {
    if (!_.isString(databaseName)) throw new Error("database name must be a string");

    if (databaseName.length === 0) throw new Error("database name cannot be the empty string");

    var invalidChars = [" ", ".", "$", "/", "\\"];
    for(var i = 0; i < invalidChars.length; i++) {
        if(databaseName.indexOf(invalidChars[i]) != -1) {
            throw new Error("database names cannot contain the character '" + invalidChars[i] + "'");
        }
    }
    
    return true;
};

module.exports = MongoPortable;

/**
 * Renames an object property.
 * 
 * @method Object#renameProperty
 * 
 * @param {String} oldName - The name of the property to rename
 * @param {String} newName - The new name of the property
 * 
 * @returns {this} The called object
 */
Object.defineProperty(
    Object.prototype, 
    'renameProperty',
    {
        writable : false, // Cannot alter this property
        enumerable : false, // Will not show up in a for-in loop.
        configurable : false, // Cannot be deleted via the delete operator
        value : function (oldName, newName) {
            if (!_.isString(oldName) || !_.isString(newName)) {
                return this;
            }
            
            // Do nothing if the names are the same
            if (oldName == newName) {
                return this;
            }
            
            // Check for the old property name to 
            // avoid a ReferenceError in strict mode.
            if (this.hasOwnProperty(oldName)) {
                this[newName] = this[oldName];
                delete this[oldName];
            }
            
            return this;
        }
    }
);