var gdjs;
(function(gdjs2) {
  let evtTools;
  (function(evtTools2) {
    let gonLearningEvents;
    (function(gonLearningEvents2) {
      const logger = new gdjs2.Logger("GonLearningEvents");
      gonLearningEvents2.sendGameEvent = (eventType, dataJson) => {
        try {
          const bridge = window.__gonSendEvent;
          if (!bridge) {
            logger.error("Launcher bridge __gonSendEvent ch\u01B0a s\u1EB5n s\xE0ng \u2014 b\u1ECF qua event " + eventType);
            return false;
          }
          let data = {};
          if (dataJson && dataJson.length > 0) {
            const parsed = JSON.parse(dataJson);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
              data = parsed;
          }
          bridge(eventType, data);
          return true;
        } catch (error) {
          logger.error("G\u1EEDi event th\u1EA5t b\u1EA1i (" + eventType + "): " + error);
          return false;
        }
      };
      gonLearningEvents2.pointIsOnObject = (object, x, y) => {
        const box = object.getAABB();
        if (!box || !box.min || !box.max)
          return false;
        return x >= box.min[0] && x <= box.max[0] && y >= box.min[1] && y <= box.max[1];
      };
    })(gonLearningEvents = evtTools2.gonLearningEvents || (evtTools2.gonLearningEvents = {}));
  })(evtTools = gdjs2.evtTools || (gdjs2.evtTools = {}));
})(gdjs || (gdjs = {}));
