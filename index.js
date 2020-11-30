/* jshint esversion: 8 */
const axios = require("axios");
const debug = false;

// Authorization Function
async function authorize(event, context) {
    var messageId = event.directive.header.messageId;
    var failure = {};
    if (event.directive.header.name === 'AcceptGrant') {
        var oauth_id = event.directive.payload.grantee.token;
        if (debug == true) log(messageId, "Authorization EVENT", JSON.stringify(event));
        try {
            var authResponse = await axios({
                method: 'post',
                url: 'https://' + process.env.WEB_API_HOSTNAME + '/api/v1/authorization',
                data: event,
                headers: {
                    'Authorization': 'Bearer ' + oauth_id,
                    'Content-Type': 'application/json'
                },
                timeout: 1500
              });
            // Success
            if (authResponse.status == 200) {
                if (debug == true) log(messageId, "Authorization SUCCESS", authResponse.data);
                return authResponse.data;
            }
            // **Anything** other than 200 is a failure condition
            else {
                failure = {
                    event: {
                        header: {
                            messageId: messageId,
                            namespace: "Alexa.Authorization",
                            name: "ErrorResponse",
                            payloadVersion: "3"
                        },
                        payload: {
                            type: "ACCEPT_GRANT_FAILED",
                            message: "Failed to handle the AcceptGrant directive"
                        }
                    }
                };
                return failure;
            }
        }
        catch(e){
            if (e.response && e.response.data && e.response.status) {
                if (debug == true) log(messageId, "Authorization ERROR", e.response.status + " " + e.response.data);
            }
            failure = {
                event: {
                    header: {
                        messageId: messageId,
                        namespace: "Alexa.Authorization",
                        name: "ErrorResponse",
                        payloadVersion: "3"
                    },
                    payload: {
                        type: "ACCEPT_GRANT_FAILED",
                        message: "Failed to handle the AcceptGrant directive"
                    }
                }
            };
            if (debug == true) log(messageId, "Authorization ERROR", e.message);
            return failure;
        }
    }
}

// Discovery Function, for Out-of-Band State Reporting
async function discover(event, context) {
    var messageId = event.directive.header.messageId;
    var response = {};
    try {
        if (debug == true) log(messageId, "Discovery EVENT", JSON.stringify(event));
        if (event.directive.header.name === 'Discover') {
            var oauth_id = event.directive.payload.scope.token;
            // var correlationToken = event.directive.header.correlationToken;
            // Get state of device
            var discoveryResponse = await axios({
                method: 'get',
                url: 'https://' + process.env.WEB_API_HOSTNAME + '/api/v1/devices',
                headers: {
                    'Authorization': 'Bearer ' + oauth_id
                },
                timeout: 1500
            });
            if (discoveryResponse.status == 200) {
                //var payload = {
                //    endpoints: JSON.parse(discoveryResponse.data)
                //};
                var payload = {
                    endpoints: discoveryResponse.data
                };
                response = {
                    event:{
                        header:{
                            namespace: "Alexa.Discovery",
                            name: "Discover.Response",
                            payloadVersion: "3",
                            messageId: messageId
                        },
                        payload: payload
                    }
                };
                if (debug == true) log(messageId, "Discovery SUCCESS", discoveryResponse.data);
                return response;
            }
            else if (discoveryResponse.status == 401) {
                response = {
                    event: {
                        header:{
                            namespace: "Alexa",
                            name: "ErrorResponse",
                            messageId: messageId,
                            payloadVersion: "3"
                        },
                        payload:{
                            type: "INVALID_AUTHORIZATION_CREDENTIAL",
                            message: "Authentication failure."
                        }
                    }
                };
                if (debug == true) log(messageId, "Discovery AUTH FAILURE", discoveryResponse.data);
                return response;
            }
        }
    }
    catch(e){
        // General failure
        if (e.response && e.response.data && e.response.status) {
            if (debug == true) log("Discovery ERROR", e.response.status + ":" + e.response.data);
        }
        response = {
            event: {
                header:{
                    namespace: "Alexa",
                    name: "ErrorResponse",
                    messageId: messageId,
                    payloadVersion: "3"
                },
                payload:{
                    type: "ENDPOINT_UNREACHABLE",
                    message: "Target endpoint unavailable."
                }
            }
        };
        if (debug == true) log(messageId, "Discovery ERROR", e.message + ": " + e.stack);
        return response;
    }
}

// Command Function
async function command(event, context) {
    var messageId = event.directive.header.messageId;
    var response = {};
    try{
        if (debug == true) log(messageId, 'Command EVENT', JSON.stringify(event));
        var oauth_id = event.directive.endpoint.scope.token;
        //log("Event", JSON.stringify(event));
        var endpointId = event.directive.endpoint.endpointId;
        var correlationToken = event.directive.header.correlationToken;

        var commandResponse = await axios({
            method: 'post',
            url: 'https://' + process.env.WEB_API_HOSTNAME + '/api/v1/command2',
            data: event,
            headers: {
                'Authorization': 'Bearer ' + oauth_id,
                'Content-Type': 'application/json'
            },
            timeout: 1500
          });
        //var dt = new Date();
        //var name = event.directive.header.name;
        //var namespace = event.directive.header.namespace;
        // Success
        if (commandResponse.status == 200) {
            if (debug == true) log(messageId, 'Command SUCCESS', JSON.stringify(commandResponse.data));
            return commandResponse.data;
        }
        else if (commandResponse.status == 401){
            response = {
                event: {
                    header:{
                        namespace: "Alexa",
                        name: "ErrorResponse",
                        messageId: messageId,
                        payloadVersion: "3"
                    },
                    payload:{
                        type: "INVALID_AUTHORIZATION_CREDENTIAL",
                        message: "Authentication failure."
                    }
                }
            };
            if (debug == true) log(messageId, 'Command AUTH FAILURE', JSON.stringify(commandResponse.data));
            return response;
        }
        else if (commandResponse.status == 404){
            response = {
                event: {
                    header:{
                        namespace: "Alexa",
                        name: "ErrorResponse",
                        messageId: messageId,
                        correlationToken: correlationToken,
                        payloadVersion: "3"
                    },
                    endpoint: {
                        scope: {
                            type: "BearerToken",
                            BearerToken: oauth_id
                            },
                        endpointId : endpointId,
                    },
                    payload:{
                        type: "NO_SUCH_ENDPOINT	",
                        message: "No such device or endpoint!"
                    }
                }
            };
            if (debug == true) log(messageId, 'Command DEVICE NOT FOUND', JSON.stringify(commandResponse.data));
            return response;
        }
        // TEMPERATURE_VALUE_OUT_OF_RANGE Response
        else if (commandResponse.status == 416){
            response = {
                event: {
                    header:{
                        namespace: "Alexa",
                        name: "ErrorResponse",
                        messageId: messageId,
                        correlationToken: correlationToken,
                        payloadVersion: "3"
                    },
                    endpoint: {
                        scope: {
                            type: "BearerToken",
                            BearerToken: oauth_id
                        },
                        endpointId : endpointId,
                    },
                    payload:{
                        type: "TEMPERATURE_VALUE_OUT_OF_RANGE",
                        message: "The requested temperature is out of range."
                    }
                }
            };
            if (debug == true) log(messageId, 'Command TEMPERATURE_VALUE_OUT_OF_RANGE', JSON.stringify(commandResponse.data));
            return response;
        }
        // VALUE_OUT_OF_RANGE Response
        else if (commandResponse.status == 417){
            response = {
                event: {
                    header:{
                        namespace: "Alexa",
                        name: "ErrorResponse",
                        messageId: messageId,
                        correlationToken: correlationToken,
                        payloadVersion: "3"
                    },
                    endpoint: {
                        scope: {
                            type: "BearerToken",
                            BearerToken: oauth_id
                        },
                        endpointId : endpointId,
                    },
                    payload:{
                        type: "VALUE_OUT_OF_RANGE",
                        message: "The requested value is out of range."
                    }
                }
            };
            if (debug == true) log(messageId, 'Command VALUE_OUT_OF_RANGE', JSON.stringify(commandResponse.data));
            return response;
        }
        // INVALID DIRECTIVE
        else if (commandResponse.status == 418){
            response = {
                event: {
                    header:{
                        namespace: "Alexa",
                        name: "ErrorResponse",
                        messageId: messageId,
                        correlationToken: correlationToken,
                        payloadVersion: "3"
                    },
                    endpoint: {
                        scope: {
                            type: "BearerToken",
                            BearerToken: oauth_id
                        },
                        endpointId : endpointId,
                    },
                    payload:{
                        type: "INVALID_DIRECTIVE",
                        message: "The device does not support this command directive."
                    }
                }
            };
            if (debug == true) log(messageId, 'Command INVALID_DIRECTIVE', JSON.stringify(commandResponse.data));
            return response;
        }
    }
    catch(e){
        response = {
            event: {
                header:{
                    namespace: "Alexa",
                    name: "ErrorResponse",
                    messageId: messageId,
                    payloadVersion: "3"
                },
                payload:{
                    type: "ENDPOINT_UNREACHABLE",
                    message: "Target endpoint unavailable."
                }
            }
        };
        if (e.response && e.response.data && e.response.status) {
            if (debug == true) log(messageId, 'Command ERROR', e.response.status + " " + JSON.stringify(e.response.data));
        }
        if (debug == true) log(messageId, "Command ERROR", e.message);
        return response;
    }
}

// Report State Function, async
async function getState (event, context) {
    // Modify existing "report" Lambda function to use /api/v1/getstate WebAPI endpoint
    var messageId = event.directive.header.messageId;
    var response = {};
    if (debug == true) log(messageId, "Get State EVENT", JSON.stringify(event));
    var oauth_id = event.directive.endpoint.scope.token;
    var endpointId = event.directive.endpoint.endpointId;
    var correlationToken = event.directive.header.correlationToken;
    try {
        // Get state of device
        var stateReport = await axios({
            method: 'get',
            url: 'https://' + process.env.WEB_API_HOSTNAME + '/api/v1/getstate/'+ endpointId,
            headers: {
                'Authorization': 'Bearer ' + oauth_id
            },
            timeout: 1500
        });
        // Handle response
        if (stateReport.status == 200) {
            if (debug == true) log(messageId, "Get State API RESPONSE", stateReport);
            // var properties = JSON.parse(stateReport.data);
            var properties = stateReport.data;
            // Build RequestState Response
            response = {};
            response.event = {
                "header":{
                    "messageId":messageId,
                    "correlationToken":correlationToken,
                    "namespace":"Alexa",
                    "name":"StateReport",
                    "payloadVersion":"3"
                },
                "endpoint":{
                    "scope": {
                        "type": "BearerToken",
                        "token": oauth_id
                    },
                "endpointId":endpointId,
                "cookie": {}
                }
            };
            response.context = {};
            response.context.properties = properties;
            response.payload = {};
            if (debug == true) log(messageId, 'Get State SUCCESS', JSON.stringify(response));
            return response;
        }
        else if (stateReport.status == 429) {
            response = {
                "event": {
                    "header": {
                      "namespace": "Alexa",
                      "name": "ErrorResponse",
                      "messageId": messageId,
                      "correlationToken": correlationToken,
                      "payloadVersion": "3"
                    },
                    "endpoint":{
                        "endpointId": endpointId
                    },
                    "payload": {
                      "type": "RATE_LIMIT_EXCEEDED",
                      "message": "Unable to reach endpoint because Node-RED Bridge appears to be offline"
                    }
                  }
                };
            if (debug == true) log(messageId, 'Get State THROTTLED', JSON.stringify(response));
            return response;
        }
        else {
            response = {
                "event": {
                    "header": {
                      "namespace": "Alexa",
                      "name": "ErrorResponse",
                      "messageId": messageId,
                      "correlationToken": correlationToken,
                      "payloadVersion": "3"
                    },
                    "endpoint":{
                        "endpointId": endpointId
                    },
                    "payload": {
                      "type": "BRIDGE_UNREACHABLE",
                      "message": "Unable to reach endpoint because Node-RED Bridge appears to be offline"
                    }
                  }
                };
                if (debug == true) log(messageId, 'Get State UNKNOWN RESPONSE CODE', response.status + " " + response.data);
            return response;
        }
    }
    catch(e) {
        if (e.response && e.response.data && e.response.status) {
            if (debug == true) log(messageId, "Get State ERROR", e.response.status + " " + e.response.data);
        }
        response = {
            "event": {
                "header": {
                  "namespace": "Alexa",
                  "name": "ErrorResponse",
                  "messageId": messageId,
                  "correlationToken": correlationToken,
                  "payloadVersion": "3"
                },
                "endpoint":{
                    "endpointId": endpointId
                },
                "payload": {
                  "type": "BRIDGE_UNREACHABLE",
                  "message": "Unable to reach endpoint because Node-RED Bridge appears to be offline"
                }
              }
            };
        if (debug == true) log(messageId, "Get State ERROR", e.message + ": " + e.stack);
        return response;
    }
}

function log(messageId, title, msg) {
    console.log(messageId, title, msg);
}

exports.handler = async (event, context) => {
    // Authorization
    if (event.directive.header.namespace === "Alexa.Authorization") {
        //log("Entry", event.directive.payload);
        let authorizationEvent = await authorize(event, context);
        return authorizationEvent;
    }
    // Discovery
    else if (event.directive.header.namespace === 'Alexa.Discovery') {
        //log("Entry", event.directive.payload);
        let discoveryEvent = await discover(event, context);
        return discoveryEvent;
    }
    // Command (w/ device-specific directives)
    else if (event.directive.header.namespace === 'Alexa.BrightnessController' ||
        (event.directive.header.namespace === 'Alexa.ChannelController' && event.directive.header.name !== 'SkipChannels') ||
        event.directive.header.namespace === 'Alexa.ColorController' ||
        event.directive.header.namespace === 'Alexa.ColorTemperatureController' ||
        event.directive.header.namespace === 'Alexa.InputController' ||
        event.directive.header.namespace === 'Alexa.LockController' ||
        event.directive.header.namespace === 'Alexa.PercentageController' ||
        event.directive.header.namespace === 'Alexa.PlaybackController' ||
        event.directive.header.namespace === 'Alexa.PowerController' ||
        event.directive.header.namespace === 'Alexa.RangeController' ||
        event.directive.header.namespace === 'Alexa.SceneController' ||
        event.directive.header.namespace === 'Alexa.Speaker' ||
        event.directive.header.namespace === 'Alexa.StepSpeaker' ||
        event.directive.header.namespace === 'Alexa.ThermostatController') {

        let commandEvent = await command(event, context);
        return commandEvent;
    }
    // Device State Report
    else if (event.directive.header.namespace === 'Alexa' && event.directive.header.name === 'ReportState') {
        let stateEvent = await getState(event, context);
        return stateEvent;
    }
    // Unhandled Request
    else {
        var messageId = event.directive.header.messageId;
        if (debug == true) log(messageId, "Unhandled EVENT", event);
        var oauth_id = event.directive.endpoint.scope.token;
        var endpointId = event.directive.endpoint.endpointId;
        var correlationToken = event.directive.header.correlationToken;
        var response = {
            event: {
                header:{
                    namespace: "Alexa",
                    name: "ErrorResponse",
                    messageId: messageId,
                    correlationToken: correlationToken,
                    payloadVersion: "3"
                },
                endpoint: {
                    scope: {
                        type: "BearerToken",
                        BearerToken: oauth_id
                    },
                    endpointId : endpointId,
                },
                payload:{
                    type: "INVALID_DIRECTIVE",
                    message: "Command or directive not supported by this endpoint"
                }
            }
        };
        //context.failed(response);
        return response;
    }
};