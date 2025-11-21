'use strict';

(function(factory) {
    if (typeof module === 'object' && typeof module.exports === 'object') {
        module.exports = function(_) {
            factory(_);
        };
    } else {
        factory(_);
    }
}(function(_) {

    var _detect_timeout;
    var _subjects = [];
    var _observables = [];

    // ES5 Object support check from Modernizr
    var _es5_object_supported = !!(Object.keys &&
        Object.create &&
        Object.getPrototypeOf &&
        Object.getOwnPropertyNames &&
        Object.isSealed &&
        Object.isFrozen &&
        Object.isExtensible &&
        Object.getOwnPropertyDescriptor &&
        Object.defineProperty &&
        Object.defineProperties &&
        Object.seal &&
        Object.freeze &&
        Object.preventExtensions);

    function ObservableArray(subject) {
        var _first_bind = true;
        var _old_subject = [];
        var _handlers = {
            generic: [],
            create: [],
            update: [],
            'delete': []
        };

        function reset() {
            callGenericSubscribers();
            _old_subject = JSON.parse(JSON.stringify(subject));
        }


        function callGenericSubscribers() {
            _.each(_handlers.generic, function(f) {
                f(subject, _old_subject);
            });
        }


        function callCreateSubscribers(new_item, item_index) {
            _.each(_handlers.create, function(f) {
                f(new_item, item_index);
            });
        }


        function callUpdateSubscribers(new_item, old_item, item_index) {
            _.each(_handlers.update, function(f) {
                f(new_item, old_item, item_index);
            });
        }


        function callDeleteSubscribers(deleted_item, item_index) {
            _.each(_handlers['delete'], function(f) {
                f(deleted_item, item_index);
            });
        }


        function detectChanges() {
            var old_length = _old_subject.length;
            var new_length = subject.length;

            if (old_length !== new_length || JSON.stringify(_old_subject) !==  JSON.stringify(subject)) {
                var max = Math.max(new_length, old_length) - 1;

                for (var i = max; i >= 0; i--) {
                    var old_item = _old_subject[i];
                    var new_item = subject[i];
                    if (i > old_length - 1) {
                        callCreateSubscribers(new_item, i);
                    } else if (i > new_length - 1) {
                        callDeleteSubscribers(old_item, i);
                    } else if (!_.isEqual(new_item, old_item)) {
                        callUpdateSubscribers(new_item, old_item, i);
                    }
                }

                reset();
            }
        }


        /* ################################################################
           Array mutator methods
        ################################################################ */


        function overrideMethod(name, f) {
            // Use Object.defineProperty to prevent methods from appearing in
            // the subject's for in loop
            if (_es5_object_supported) {
                Object.defineProperty(subject, name, {
                    value: f
                });
            } else {
                subject[name] = f;
            }
        }


        // We need to augment all the standard Array mutator methods to notify
        // all observers in case of a change.
        //
        // https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array#Mutator_methods

        // pop: Removes the last element from an array and returns that element.
        overrideMethod('pop', function() {
            detectChanges();
            var deleted_item = Array.prototype.pop.apply(this, arguments);
            var item_index = this.length;
            callDeleteSubscribers(deleted_item, item_index);
            reset();
            return deleted_item;
        });


        // push: Adds one or more elements to the end of an array and returns
        // the new length of the array.
        overrideMethod('push', function() {
            detectChanges();
            var new_item = arguments[0];
            var new_length = Array.prototype.push.apply(this, arguments);
            callCreateSubscribers(new_item, new_length - 1);
            reset();
            return new_length;
        });


        // reverse: Reverses the order of the elements of an array -- the first
        // becomes the last, and the last becomes the first.
        overrideMethod('reverse', function() {
            detectChanges();
            // Always use reverse loops when deleting stuff based on index
            for (var j = this.length - 1; j >= 0; j--) {
                callDeleteSubscribers(this[j], j);
            }
            var result = Array.prototype.reverse.apply(this, arguments);
            _.each(this, callCreateSubscribers);
            reset();
            return result;
        });


        // shift: Removes the first element from an array and returns that
        // element.
        overrideMethod('shift', function() {
            detectChanges();
            var deleted_item = Array.prototype.shift.apply(this, arguments);
            callDeleteSubscribers(deleted_item, 0);
            reset();
            return deleted_item;
        });


        // sort: Sorts the elements of an array.
        overrideMethod('sort', function() {
            detectChanges();
            // Always use reverse loops when deleting stuff based on index
            for (var j = this.length - 1; j >= 0; j--) {
                callDeleteSubscribers(this[j], j);
            }
            var result = Array.prototype.sort.apply(this, arguments);
            _.each(this, callCreateSubscribers);
            reset();
            return result;
        });


        // splice: Adds and/or removes elements from an array.
        overrideMethod('splice', function(i /*, length , insert */) {
            detectChanges();
            var insert = Array.prototype.slice.call(arguments, 2);
            var deleted = Array.prototype.splice.apply(this, arguments);
            // Always use reverse loops when deleting stuff based on index
            for (var j = deleted.length - 1; j >= 0; j--) {
                callDeleteSubscribers(deleted[j], i + j);
            }
            _.each(insert, function(new_item, k) {
                callCreateSubscribers(new_item, i + k);
            });
            reset();
            return deleted;
        });


        // unshift: Adds one or more elements to the front of an array and
        // returns the new length of the array.
        overrideMethod('unshift', function() {
            detectChanges();
            var new_length = Array.prototype.unshift.apply(this, arguments);
            _.each(arguments, function(new_item, i) {
                callCreateSubscribers(new_item, i);
            });
            reset();
            return new_length;
        });


        //setInterval(detectChanges, 250);
        //detectChanges();


        return {
            detectChanges: detectChanges,
            unbind: function(type, handler) {
                if (_.isUndefined(type) && _.isUndefined(handler)) {
                    _.each(_handlers, function(handler) {
                        handler.length = 0;
                    });
                } else if (_.isString(type) && _.isUndefined(handler)) {
                    _handlers[type].length = 0;
                } else if (_.isFunction(type) && _.isUndefined(handler)) {
                    handler = type;
                    type = 'generic';
                    _handlers[type] = _.without(_handlers[type], handler);
                } else if (_.isString(type) && _.isFunction(handler)) {
                    _handlers[type] = _.without(_handlers[type], handler);
                }

            },
            bind: function(type, handler) {
                _handlers[type].push(handler);
                if (type === 'generic') {
                    handler(subject, _old_subject);
                } else if (type === 'create') {
                    _.each(subject, function(item, index) {
                        // Don't do this, it will add the current array as an
                        // extra argument:
                        //_.each(subject, handler);
                        handler(item, index);
                    });
                }

                if (_first_bind) {
                    _old_subject = JSON.parse(JSON.stringify(subject));
                    _first_bind = false;
                }
            }
        };

    }


    _.mixin({
        observe: function(subject, type, f) {
            if (!_.isArray(subject)) {
                throw 'subject should be a array';
            }

            if (_.isFunction(type)) {
                f = type;
                type = 'generic';
            }

            var index = _.indexOf(_subjects, subject);
            if (index === -1) {
                index = _subjects.length;
                _subjects.push(subject);
                var observable = new ObservableArray(subject);
                _observables.push(observable);
            }
            _observables[index].bind(type, f);

            scheduleDetectAllChanges();
            return subject;
        },


        unobserve: function(subject, type, f) {
            if (!arguments.length) {
                // _.unobserve() removes all observers
                _.each(_observables, function(observable) {
                    observable.unbind();
                });
                _subjects.length = 0;
                _observables.length = 0;
                return;
            }

            if (!_.isArray(subject)) {
                throw 'subject should be a array';
            }

            var index = _.indexOf(_subjects, subject);
            if (index === -1) {
                return;
            }

            _observables[index].unbind(type, f);
            return subject;
        }
    });


    function detectAllChanges() {
        if (!_observables.length) {
            _detect_timeout = null;
            return;
        }

        _.each(_observables, function(observable) {
            observable.detectChanges();
        });

        scheduleDetectAllChanges();
    }


    function scheduleDetectAllChanges() {
        if (_detect_timeout) {
            clearTimeout(_detect_timeout);
        }
        _detect_timeout = setTimeout(detectAllChanges, 250);
    }

}));