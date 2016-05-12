/**
 * @file Collection.js - based on Monglo#Collection ({@link https://github.com/Monglo}) by Christian Sullivan <cs@euforic.co> | Copyright (c) 2012
 * @version 0.0.1
 * 
 * @author Eduardo Astolfi <eduardo.astolfi91@gmail.com>
 * @copyright 2016 Eduardo Astolfi <eduardo.astolfi91@gmail.com>
 * @license MIT Licensed
 */

var Logger = require("./utils/Logger"),
    _ = require("lodash"),
    Cursor = require("./Cursor"),
    ObjectId = require('./ObjectId'),
    Selector = require("./Selector");
    
/**
 * Collection
 * 
 * @module Collection
 * @constructor
 * @since 0.0.1
 * 
 * @classdesc Collection class that maps a MongoDB-like collection
 * 
 * @param {MongoPortable} db - Additional options
 * @param {String} collectionName - The name of the collection
 * @param {Object} [options] - Database object
 * 
 * @param {Object} [options.pkFactory=null] - Object overriding the basic "ObjectId" primary key generation.
 * 
 */
var Collection = function(db, collectionName, options) {
    if (!(this instanceof Collection)) return new Collection(db, collectionName, options);

    if (_.isNil(db)) throw new Error("db parameter required");
    
    if (_.isNil(collectionName)) throw new Error("collectionName parameter required");
    
    if (_.isNil(options) || !_.isPlainObject(options)) options = {};
    
    Collection.checkCollectionName(collectionName);

    this.db = db;
    this.name = collectionName;
    this.fullName = this.db.databaseName + '.' + this.name;
    this.docs = [];
    this.doc_indexes = {};
    this.snapshots = [];
    this.opts = {}; // Default options
    
    _.merge(this.opts, options);
};

// TODO enforce rule that field names can't start with '$' or contain '.'
// (real mongodb does in fact enforce this)
// TODO possibly enforce that 'undefined' does not appear (we assume
// this in our handling of null and $exists)
/**
 * Inserts a document into the collection
 * 
 * @method Collection#insert
 * 
 * @param {Object} doc - Document to be inserted
 * @param {Object} [options] - Additional options
 * 
 * @param {Boolean} [options.chain=false] - If set to "true" returns this instance, so it can be chained with other methods
 * 
 * @param {Function} [callback=null] Callback function to be called at the end with the results
 * 
 * @returns {Object|Collection} If "options.chain" set to "true" returns this instance, otherwise returns the inserted document
 */
Collection.prototype.insert = function (doc, options, callback) {
    if (_.isNil(doc)) throw new Error("doc parameter required");
    
    if (!_.isPlainObject(doc)) throw new Error("doc must be an object");
    
    if (_.isNil(options)) options = {};
    
    if (_.isFunction(options)) {
        callback = options;
        options = {};
    }
    
    if (!_.isNil(callback) && !_.isFunction(callback)) throw new Error("callback must be a function");
    
    // Creating a safe copy of the document
    var _doc = _.cloneDeep(doc);

    // If the document comes with a number ID, parse it to String
    if (_.isNumber(_doc._id)) {
        _doc._id = _.toString(_doc._id);
    }

    // Remove every non-number character
    _doc._id = (_doc._id || '').replace(/\D/g, '');

    if (_.isNil(_doc._id) || !_doc._id.length) {
        _doc._id = new ObjectId();
    }

    // Add options to more dates
    _doc.timestamp = new ObjectId().generationTime;
    
    // Reverse
    this.doc_indexes[_.toString(_doc._id)] = this.docs.length;
    this.docs.push(_doc);
    
    this.db._emit(
        'insert',
        {
            collection: this,
            doc: _doc
        }
    );

    if (callback) callback(null, _doc);

    if (options.chain) return this;
    
    return _doc;
};

/**
 * Finds all matching documents
 * 
 * @method Collection#find
 * 
 * @param {Object|Array|String} [selection={}] - The selection for matching documents
 * @param {Object|Array|String} [fields={}] - The fields of the document to show
 * @param {Object} [options] - Additional options
 * 
 * @param {Number} [options.skip] - Number of documents to be skipped
 * @param {Number} [options.limit] - Max number of documents to display
 * @param {Object|Array|String} [options.fields] - Same as "fields" parameter (if both passed, "options.fields" will be ignored)
 * @param {Boolean} [options.chain=false] - If set to "true" returns this instance, so it can be chained with other methods
 * @param {Boolean} [options.forceFetch=false] - If set to "true" returns the array of documents already fetched
 * 
 * @param {Function} [callback=null] - Callback function to be called at the end with the results
 * 
 * @returns {Array|Collection|Cursor} If "options.chain" set to "true" returns this instance, if "options.forceFetch" set to true returns the array of documents, otherwise returns a cursor
 */
Collection.prototype.find = function (selection, fields, options, callback) {
    if (_.isNil(selection)) selection = {};
    
    if (_.isNil(fields)) fields = [];
    
    if (_.isNil(options)) {
        options = {
            skip: 0,
            limit: 15   // for no limit pass [options.limit = -1]
        };
    }
    
    if (_.isFunction(selection)) {
        callback = selection;
        selection = {};
    }
    
    if (_.isFunction(fields)) {
        callback = fields;
        fields = [];
    }
    
    if (_.isFunction(options)) {
        callback = options;
        options = {};
    }
    
    // Check special case where we are using an objectId
    if(selection instanceof ObjectId) {
        selection = {
            _id: selection
        };
    }
    
    if (!_.isNil(callback) && !_.isFunction(callback)) throw new Error("callback must be a function");
    
    // Compile selection and fields
    var selectionCompiled = Selector._compileSelector(selection);
    var fieldsCompiled = Selector._compileFields(fields);   // TODO

    if (options.fields) {
        // Add warning if fields already passed
        fieldsCompiled = Selector._compileFields(options.fields);
    }

    // callback for backward compatibility
    var cursor = new Cursor(this.db, this, selectionCompiled, fieldsCompiled, options);

    this.db._emit(
        'find',
        {
            collection: this,
            selector: selectionCompiled,
            fields: fieldsCompiled,
            options: options
        }
    );
    
    // Pass the cursor fetched to the callback
    // Add [options.noFetchCallback = true]
    if (callback) callback(null, cursor.fetch());

    if (options.chain) {
        return this;
    } else if (options.forceFetch) {
        return cursor.fetch();
    } else {
        return cursor;
    }
};

/**
 * Finds the first matching document
 * 
 * @method Collection#findOne
 * 
 * @param {Object|Array|String} [selection={}] - The selection for matching documents
 * @param {Object|Array|String} [fields={}] - The fields of the document to show
 * @param {Object} [options] - Additional options
 * 
 * @param {Number} [options.skip] - Number of documents to be skipped
 * @param {Number} [options.limit] - Max number of documents to display
 * @param {Object|Array|String} [options.fields] - Same as "fields" parameter (if both passed, "options.fields" will be ignored)
 * 
 * @param {Function} [callback=null] - Callback function to be called at the end with the results
 * 
 * @returns {Object} Returns the first matching document of the collection
 */
Collection.prototype.findOne = function (selection, fields, options, callback) {
    if (_.isNil(selection)) selection = {};
    
    if (_.isNil(fields)) fields = [];
    
    if (_.isNil(options)) {
        options = {
            skip: 0,
            limit: 15   // for no limit pass [options.limit = -1] -> manage with cursor
        };
    }
    
    if (_.isFunction(selection)) {
        callback = selection;
        selection = {};
    }
    
    if (_.isFunction(fields)) {
        callback = fields;
        fields = [];
    }
    
    if (_.isFunction(options)) {
        callback = options;
        options = {};
    }
    
    // Check special case where we are using an objectId
    if(selection instanceof ObjectId) {
        selection = {
            _id: selection
        };
    }
    
    if (!_.isNil(callback) && !_.isFunction(callback)) throw new Error("callback must be a function");
    
    // Compile selection and fields
    var selectionCompiled = Selector._compileSelector(selection);
    var fieldsCompiled = Selector._compileFields(fields);   // TODO

    if (options.fields) {
        // Add warning if fields already passed
        fieldsCompiled = Selector._compileFields(options.fields);
    }

    var cursor = new Cursor(this.db, this, selectionCompiled, fieldsCompiled, options);

    // this.emit('find', selector, cursor, o);

    this.db._emit(
        'findOne',
        {
            collection: this,
            selector: selectionCompiled,
            fields: fieldsCompiled,
            options: options
        }
    );
    
    var res = null;
    
    if (cursor.hasNext()) {
        res = cursor.next();
    }
    
    // Pass the cursor fetched to the callback
    // Add [options.noFetchCallback = true]
    if (callback) callback(null, res);
    
    return res;
};


/**
 * Updates one or many documents
 * 
 * @method Collection#update
 * 
 * @param {Object|Array|String} [selection={}] - The selection for matching documents
 * @param {Object} [update={}] - The update operation
 * @param {Object} [options] - Additional options
 * 
 * @param {Number} [options.updateAsMongo=true] - By default: 
 *      If the [update] object contains update operator modifiers, such as those using the "$set" modifier, then:
 *          <ul>
 *              <li>The [update] object must contain only update operator expressions</li>
 *              <li>The Collection#update method updates only the corresponding fields in the document</li>
 *          <ul>
 *      If the [update] object contains only "field: value" expressions, then:
 *          <ul>
 *              <li>The Collection#update method replaces the matching document with the [update] object. The Collection#update method does not replace the "_id" value</li>
 *              <li>Collection#update cannot update multiple documents</li>
 *          <ul>
 * 
 * @param {Number} [options.override=false] - Replaces the whole document (only apllies when [updateAsMongo=false])
 * @param {Number} [options.upsert=false] - Creates a new document when no document matches the query criteria
 * @param {Number} [options.multi=false] - Updates multiple documents that meet the criteria
 * @param {Object} [options.writeConcern=null] - An object expressing the write concern
 * 
 * @param {Function} [callback=null] - Callback function to be called at the end with the results
 * 
 * @returns {Object} Object with the update/insert (if upsert=true) information
 */
Collection.prototype.update = function (selection, update, options, callback) {
    if (_.isNil(selection)) selection = {};
    
    if (_.isNil(update)) update = [];
    
    if (_.isNil(options)) {
        options = {
            skip: 0,
            limit: 15   // for no limit pass [options.limit = -1]
        };
    }
    
    if (_.isFunction(selection)) {
        callback = selection;
        selection = {};
    }
    
    if (_.isFunction(update)) {
        callback = update;
        update = [];
    }
    
    if (_.isFunction(options)) {
        callback = options;
        options = {};
    }
    
    // Check special case where we are using an objectId
    if(selection instanceof ObjectId) {
        selection = {
            _id: selection
        };
    }
    
    if (!_.isNil(callback) && !_.isFunction(callback)) throw new Error("callback must be a function");

    var res = null;

    var docs = null;
    if (options.multi) {
        docs = this.find(selection, null, { forceFetch: true });
    } else {
        docs = this.findOne(selection);
    }
    
    if (_.isNil(docs)) {
        docs = [];
    }
    
    if (!_.isArray(docs)) {
        docs = [docs];
    }
    
    if (docs.length === 0) {
        if (options.upsert) {
            var inserted = this.insert(update);

            res = {
                updated: {
                    documents: null,
                    count: 0
                },
                inserted: {
                    documents: inserted,
                    count: 1
                }
            };
        } else {
            // No documents found
            res = {
                updated: {
                    documents: null,
                    count: 0
                },
                inserted: {
                    documents: null,
                    count: 0
                }
            };
        }
    } else {
        var updatedDocs = [];
        
        for (var i = 0; i < docs.length; i++) {
            var doc = docs[i];
            
            var override = null;
            
            var hasModifier = false;
            
            for (let key in update) {
                // IE7 doesn't support indexing into strings (eg, key[0] or key.indexOf('$') ), so use substr.
                // Testing over the first letter:
                //      Bests result with 1e8 loops => key[0](~3s) > substr(~5s) > regexp(~6s) > indexOf(~16s)
                
                var modifier = (key.substr(0, 1) === '$');
                if (modifier) {
                    hasModifier = true;
                }
                
                if (options.updateAsMongo) {
                    if (hasModifier && !modifier) throw new Error("All update fields must be an update operator");
                    
                    if (!hasModifier && options.multi) throw new Error("You can not update several documents when no update operators are included");
                    
                    if (hasModifier) override = false;
                    
                    if (!hasModifier) override = true;
                } else {
                    override = !!options.override;
                }
            }
            
            var _docUpdate = null;
            
            // Override the document except for the "_id"
            if (override) {
                // Must ignore fields starting with '$', '.'...
                _docUpdate = _.cloneDeep(update);
                
                for (let key in update) {
                    if (key.substr(0, 1) === '$' || /\./g.test(key)) {
                        Logger.warn(`The field ${key} can not begin with '$' or contain '.'`);
                    } else {
                        delete _docUpdate[key];
                    }
                }
                
                // Do not override the "_id"
                _docUpdate._id = doc._id;
            } else {
                _docUpdate = _.cloneDeep(doc);
                
                for (let key in update) {
                    let val = update[key];
                    
                    if (key.substr(0, 1) === '$') {
                        _applyModifier(_docUpdate, key, val);
                    } else {
                        if (!_.isNil(_docUpdate[key])) {
                            if (key !== '_id') {
                                _docUpdate[key] = val;
                            } else {
                                Logger.warn("The field '_id' can not be updated");
                            }
                        } else {
                            Logger.warn(`The document does not contains the field ${key}`);
                        }
                    }
                }
            }
            
            updatedDocs.push(_docUpdate);
            
            let idx = this.doc_indexes[_docUpdate._id];
            this.docs[idx] = _docUpdate;
        }
        
        this.db._emit(
            'update',
            {
                collection: this,
                selector: selection,
                modifier: update,
                options: options,
                docs: updatedDocs
            }
        );
        
        res = {
            updated: {
                documents: updatedDocs,
                count: updatedDocs.length
            },
            inserted: {
                documents: null,
                count: 0
            }
        };
    }
    
    
    if (callback) callback(null, res);
    
    return res;
};

var _applyModifier = function(_docUpdate, key, val) {
    var mod = _modifiers[key];
                        
    if (!mod) {
        throw new Error(`Invalid modifier specified: ${key}`);
    }
    
    for (var keypath in val) {
        var arg = val[keypath];
        var keyparts = keypath.split('.');
        var no_create = !!Collection._noCreateModifiers[key];
        var forbid_array = (key === "$rename");
        var target = Collection._findModTarget(_docUpdate, keyparts, no_create, forbid_array);
        var field = keyparts.pop();

        mod(target, field, arg, keypath, _docUpdate);
    }
};

/**
 * Removes one or many documents
 * 
 * @method Collection#remove
 * 
 * @param {Object|Array|String} [selection={}] - The selection for matching documents
 * @param {Object} [options] - Additional options
 * 
 * @param {Number} [options.justOne=false] - Deletes the first occurrence of the selection
 * @param {Object} [options.writeConcern=null] - An object expressing the write concern
 * 
 * @param {Function} [callback=null] - Callback function to be called at the end with the results
 * 
 * @returns {Object} Object with the deleted documents
 */
Collection.prototype.remove = function (selection, callback) {
    if (_.isNil(selection)) selection = {};
    
    if (_.isFunction(selection)) {
        callback = selection;
        selection = {};
    }
    
    // Check special case where we are using an objectId
    if(selection instanceof ObjectId) {
        selection = {
            _id: selection
        };
    }
    
    if (!_.isNil(callback) && !_.isFunction(callback)) throw new Error("callback must be a function");
    
    var cursor = this.find(selection);
    
    var docs = [];
    cursor.forEach(doc => {
        var idx = this.doc_indexes[doc._id];
        
        delete this.doc_indexes[doc._id];
        this.docs.splice(idx, 1);
        
        docs.push(doc);
    });
    
    this.db._emit(
        'remove',
        {
            collection: this,
            selector: selection,
            docs: docs
        }
    );
    
    if (callback) callback(null, docs);
    
    return docs;
};

/**
* @ignore
*/
Collection.prototype.save = function(obj, fn) {
    var self = this;

    var callback = fn || function(){};

    if (self.docs[obj._id]) {
        self.update({_id: obj._id}, callback);
    } else {
        self.insert(obj,callback);
    }
};

/**
* @ignore
*/
Collection.prototype.ensureIndex = function() {
    //TODO Implement EnsureIndex
    throw new Error('Collection#ensureIndex unimplemented by driver');
};

// TODO document (at some point)
// TODO test
// TODO obviously this particular implementation will not be very efficient
/**
* @ignore
*/
Collection.prototype.backup = function (backupID, fn) {
    if ('function' === typeof backupID) {
        fn = backupID;
        backupID = new ObjectId();
    }

    var callback = fn||function(){};
    var snapID = backupID;

    this.snapshots[snapID] = this.docs;
    this.emit(
        'snapshot',
        {
            _id : this.docs,
            data : this.docs 
        }
    );

    callback(null, this.snapshots[snapID]);

    return this;
};

// Lists available Backups
/**
* @ignore
*/
Collection.prototype.backups = function (fn) {
    var callback = fn || function(){};
    var keys = [];
    var backups = this.snapshots;

    for (var id in backups) {
        keys.push({id: id, data: backups[id]});
    }

    callback(keys);

    return this;
};

// Lists available Backups
/**
* @ignore
*/
Collection.prototype.removeBackup = function (backupID, fn) {
    if (!backupID || 'function' === typeof backupID) {
        fn = backupID;
        this.snapshots = {};
    } else {
        var id = String(backupID);
        delete this.snapshots[id];
    }

    var callback = fn || function(){};

    callback(null);

    return this;
};


// Restore the snapshot. If no snapshot exists, raise an exception;
/**
* @ignore
*/
Collection.prototype.restore = function ( backupID, fn ) {
    var callback = fn || function(){};
    var snapshotCount = Object.size(this.snapshots);

    if (snapshotCount===0) {
        throw new Error("No current snapshot");
    }

    var backupData = this.snapshots[backupID];

    if (!backupData) {
        throw new Error("Unknown Backup ID "+backupID);
    }

    this.docs = backupData;
    this.emit('restore');

    callback(null);

    return this;
};

// for a.b.c.2.d.e, keyparts should be ['a', 'b', 'c', '2', 'd', 'e'],
// and then you would operate on the 'e' property of the returned
// object. if no_create is falsey, creates intermediate levels of
// structure as necessary, like mkdir -p (and raises an exception if
// that would mean giving a non-numeric property to an array.) if
// no_create is true, return undefined instead. may modify the last
// element of keyparts to signal to the caller that it needs to use a
// different value to index into the returned object (for example,
// ['a', '01'] -> ['a', 1]). if forbid_array is true, return null if
// the keypath goes through an array.
/**
* @ignore
*/
Collection._findModTarget = function (doc, keyparts, no_create, forbid_array) {
    for (var i = 0; i < keyparts.length; i++) {
        var last = (i === keyparts.length - 1);
        var keypart = keyparts[i];
        var numeric = /^[0-9]+$/.test(keypart);

        if (no_create && (!(typeof doc === "object") || !(keypart in doc))) {
            return undefined;
        }

        if (doc instanceof Array) {
            if (forbid_array) return null;

            if (!numeric) {
                throw new Error("can't append to array using string field name [" + keypart + "]");
            }

            keypart = _.toNumber(keypart);

            if (last) {
                // handle 'a.01'
                keyparts[i] = keypart;
            }

            while (doc.length < keypart) {
                doc.push(null);
            }

            if (!last) {
                if (doc.length === keypart) {
                    doc.push({});
                } else if (typeof doc[keypart] !== "object") {
                    throw new Error("can't modify field '" + keyparts[i + 1] + "' of list value " + JSON.stringify(doc[keypart]));
                }
            }
        } else {
            // XXX check valid fieldname (no $ at start, no .)
            if (!last && !(keypart in doc)) {
                doc[keypart] = {};
            }
        }

        if (last) return doc;

        doc = doc[keypart];
    }

    // notreached
};

/**
* @ignore
*/
Collection._noCreateModifiers = {
    $unset: true,
    $pop: true,
    $rename: true,
    $pull: true,
    $pullAll: true
};

/**
* @ignore
*/
var _modifiers = {
    $inc: function (target, field, arg) {
        if (typeof arg !== "number") {
            throw new Error("Modifier $inc allowed for numbers only");
        }

        if (field in target) {
            if (typeof target[field] !== "number") {
                throw new Error("Cannot apply $inc modifier to non-number");
            }

            target[field] += arg;
        } else {
            target[field] = arg;
        }
    },

    $set: function (target, field, arg) {
        target[field] = _.cloneDeep(arg);
    },

    $unset: function (target, field, arg) {
        if (target !== undefined) {
            if (target instanceof Array) {
                if (field in target) {
                    target[field] = null;
                }
            } else {
                delete target[field];
            }
        }
    },

    $push: function (target, field, arg) {
        var x = target[field];

        if (x === undefined) {
            target[field] = [arg];
        } else if (!(x instanceof Array)) {
            throw new Error("Cannot apply $push modifier to non-array");
        } else {
            x.push(_.cloneDeep(arg));
        }
    },

    $pushAll: function (target, field, arg) {
        if (!(typeof arg === "object" && arg instanceof Array)) {
            throw new Error("Modifier $pushAll/pullAll allowed for arrays only");
        }

        var x = target[field];

        if (x === undefined) {
            target[field] = arg;
        } else if (!(x instanceof Array)) {
            throw new Error("Cannot apply $pushAll modifier to non-array");
        } else {
            for (var i = 0; i < arg.length; i++) {
                x.push(arg[i]);
            }
        }
    },

    $addToSet: function (target, field, arg) {
        var x = target[field];

        if (x === undefined) {
            target[field] = [arg];
        } else if (!(x instanceof Array)) {
            throw new Error("Cannot apply $addToSet modifier to non-array");
        } else {
            var isEach = false;
            if (typeof arg === "object") {
                for (var k in arg) {
                    if (k === "$each") {
                        isEach = true;
                    }
                    
                    break;
                }
            }

            var values = isEach ? arg["$each"] : [arg];
            _.forEach(values, function (value) {
                for (var i = 0; i < x.length; i++) {
                    if (Selector._f._equal(value, x[i])) return;
                }

                x.push(value);
            });
        }
    },

    $pop: function (target, field, arg) {
        if (target === undefined) return;

        var x = target[field];

        if (x === undefined) {
            return;
        } else if (!(x instanceof Array)) {
            throw new Error("Cannot apply $pop modifier to non-array");
        } else {
            if (typeof arg === 'number' && arg < 0) {
                x.splice(0, 1);
            } else {
                x.pop();
            }
        }
    },

    $pull: function (target, field, arg) {
        if (target === undefined) return;

        var x = target[field];

        if (x === undefined) {
            return;
        } else if (!(x instanceof Array)) {
            throw new Error("Cannot apply $pull/pullAll modifier to non-array");
        } else {
            var out = [];
            
            if (typeof arg === "object" && !(arg instanceof Array)) {
                // XXX would be much nicer to compile this once, rather than
                // for each document we modify.. but usually we're not
                // modifying that many documents, so we'll let it slide for
                // now

                // XXX _compileSelector isn't up for the job, because we need
                // to permit stuff like {$pull: {a: {$gt: 4}}}.. something
                // like {$gt: 4} is not normally a complete selector.
                // same issue as $elemMatch possibly?
                var match = Selector._compileSelector(arg);

                for (var i = 0; i < x.length; i++) {
                    if (!match(x[i])) {
                        out.push(x[i]);
                    }
                }
            } else {
                for (var i = 0; i < x.length; i++) {
                    if (!Selector._f._equal(x[i], arg)) {
                        out.push(x[i]);
                    }
                }
            }

            target[field] = out;
        }
    },

    $pullAll: function (target, field, arg) {
        if (target === undefined) return;

        if (!(typeof arg === "object" && arg instanceof Array)) {
            throw new Error("Modifier $pushAll/pullAll allowed for arrays only");
        }

        var x = target[field];

        if (x === undefined) {
            return;
        } else if (!(x instanceof Array)) {
            throw new Error("Cannot apply $pull/pullAll modifier to non-array");
        } else {
            var out = [];

            for (var i = 0; i < x.length; i++) {
                var exclude = false;

                for (var j = 0; j < arg.length; j++) {
                    if (Selector._f._equal(x[i], arg[j])) {
                        exclude = true;
                        
                        break;
                    }
                }

                if (!exclude) {
                    out.push(x[i]);
                }
            }

            target[field] = out;
        }
    },

    $rename: function (target, field, arg, keypath, doc) {
        if (target === undefined) return;
        
        if (keypath === arg) {
            // no idea why mongo has this restriction..
            throw new Error("$rename source must differ from target");
        }

        if (target === null) {
            throw new Error("$rename source field invalid");
        }

        if (typeof arg !== "string") {
            throw new Error("$rename target must be a string");
        }

        var v = target[field];
        delete target[field];

        var keyparts = arg.split('.');
        var target2 = Collection._findModTarget(doc, keyparts, false, true);

        if (target2 === null) {
            throw new Error("$rename target field invalid");
        }

        var field2 = keyparts.pop();
        
        target2[field2] = v;
    },

    $bit: function (target, field, arg) {
        // XXX mongo only supports $bit on integers, and we only support
        // native javascript numbers (doubles) so far, so we can't support $bit
        throw new Error("$bit is not supported");
    }
};

/**
* @ignore
*/
Collection.checkCollectionName = function(collectionName) {
    if (!_.isString(collectionName)) {
        throw new Error("collection name must be a String");
    }

    if (!collectionName || collectionName.indexOf('..') !== -1) {
        throw new Error("collection names cannot be empty");
    }

    if (collectionName.indexOf('$') != -1 && collectionName.match(/((^\$cmd)|(oplog\.\$main))/) === null) {
        throw new Error("collection names must not contain '$'");
    }

    if (collectionName.match(/^\.|\.$/) !== null) {
        throw new Error("collection names must not start or end with '.'");
    }
};

/**
* @ignore
*/
Collection.prototype.rename = function(newName) {
    if (_.isString(newName)) {
        if (this.name !== newName) {
            Collection.checkCollectionName(newName);
            
            this.name = newName;
            this.fullName = this.db.databaseName + '.' + this.name;
            
            return this;
        }
    } else {
        // Error
    }
};

module.exports = Collection;

/**
 * Gets the size of an object.
 * 
 * @method Object#size
 * 
 * @param {Object} obj - The object
 * 
 * @returns {Number} The size of the object
 */
Object.size = function(obj) {
    var size = 0, 
        key;
    
    for (key in obj) {
        if (obj.hasOwnProperty(key)) {
            size++;
        }
    }
    
    return size;
};