var restify = require('restify');
var builder = require('botbuilder');

// Get secrets from server environment
var botConnectorOptions = { 
    appId: process.env.BOTFRAMEWORK_APPID, 
    appSecret: process.env.BOTFRAMEWORK_APPSECRET 
};

var model = 'https://api.projectoxford.ai/luis/v1/application?id=c413b2ef-382c-45bd-8ff0-f76d60e2a821&subscription-key=c56a0aa53db7476b870b97d40107782f&q='
var dialog = new builder.LuisDialog(model);
var luis = new builder.BotConnectorBot(luisBotConnectorOptions);
luis.add('/', dialog);

// Add intent handlers
dialog.on('builtin.intent.alarm.set_alarm', [
    function (session, args, next) {
        // Resolve and store any entities passed from LUIS.
        var title = builder.EntityRecognizer.findEntity(args.entities, 'builtin.alarm.title');
        var time = builder.EntityRecognizer.resolveTime(args.entities);
        var alarm = session.dialogData.alarm = {
          title: title ? title.entity : null,
          timestamp: time ? time.getTime() : null  
        };
        
        // Prompt for title
        if (!alarm.title) {
            builder.Prompts.text(session, 'What would you like to call your alarm?');
        } else {
            next();
        }
    },
    function (session, results, next) {
        var alarm = session.dialogData.alarm;
        if (results.response) {
            alarm.title = results.response;
        }
        
        // Prompt for time (title will be blank if the user said cancel)
        if (alarm.title && !alarm.timestamp) {
            builder.Prompts.time(session, 'What time would you like to set the alarm for?');
        } else {
            next();
        }
    },
    function (session, results) {
        var alarm = session.dialogData.alarm;
        if (results.response) {
            var time = builder.EntityRecognizer.resolveTime([results.response]);
            alarm.timestamp = time ? time.getTime() : null;
        }
        
        // Set the alarm (if title or timestamp is blank the user said cancel)
        if (alarm.title && alarm.timestamp) {
            // Save address of who to notify and write to scheduler.
            alarm.to = session.message.from;
            alarm.from = session.message.to;
            alarms[alarm.title] = alarm;
            
            // Send confirmation to user
            var date = new Date(alarm.timestamp);
            var isAM = date.getHours() < 12;
            session.send('Creating alarm named "%s" for %d/%d/%d %d:%02d%s',
                alarm.title,
                date.getMonth() + 1, date.getDate(), date.getFullYear(),
                isAM ? date.getHours() : date.getHours() - 12, date.getMinutes(), isAM ? 'am' : 'pm');
        } else {
            session.send('Ok... no problem.');
        }
    }
]);

dialog.on('builtin.intent.alarm.delete_alarm', [
    function (session, args, next) {
        // Resolve entities passed from LUIS.
        var title;
        var entity = builder.EntityRecognizer.findEntity(args.entities, 'builtin.alarm.title');
        if (entity) {
            // Verify its in our set of alarms.
            title = builder.EntityRecognizer.findBestMatch(alarms, entity.entity);
        }
        
        // Prompt for alarm name
        if (!title) {
            builder.Prompts.choice(session, 'Which alarm would you like to delete?', alarms);
        } else {
            next({ response: title });
        }
    },
    function (session, results) {
        // If response is null the user canceled the task
        if (results.response) {
            delete alarms[results.response.entity];
            session.send("Deleted the '%s' alarm.", results.response.entity);
        } else {
            session.send('Ok... no problem.');
        }
    }
]);

dialog.onDefault(builder.DialogAction.send("I'm sorry I didn't understand. I can only create & delete alarms. And I can only understand English!"))


// Setup Restify Server
var server = restify.createServer();

// Handle Bot Framework messages
server.post('/api/luis', luis.verifyBotFramework(), luis.listen());

// Serve a static web page
server.get(/.*/, restify.serveStatic({
	'directory': '.',
	'default': 'index.html'
}));

server.listen(process.env.port || 3978, function () {
    console.log('%s listening to %s', server.name, server.url); 
});
