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
      gonLearningEvents2.sendObjectiveViewed = (nodeId, title) => gonLearningEvents2.sendGameEvent("objective_viewed", JSON.stringify({ nodeId, ...title ? { title } : {}, source: "gdevelop_editor" }));
      gonLearningEvents2.pointIsOnObject = (object, x, y) => {
        const box = object.getAABB();
        if (!box || !box.min || !box.max)
          return false;
        return x >= box.min[0] && x <= box.max[0] && y >= box.min[1] && y <= box.max[1];
      };
      gonLearningEvents2.pointIsOnObjectCondition = (objectsListsOrObject, x, y) => {
        if (objectsListsOrObject && typeof objectsListsOrObject === "object" && typeof objectsListsOrObject.getAABB === "function") {
          return gonLearningEvents2.pointIsOnObject(objectsListsOrObject, x, y);
        }
        const lists = objectsListsOrObject;
        if (!lists || typeof lists !== "object")
          return false;
        for (const listName of Object.keys(lists)) {
          const list = lists[listName];
          if (!Array.isArray(list))
            continue;
          for (const object of list) {
            if (gonLearningEvents2.pointIsOnObject(object, x, y))
              return true;
          }
        }
        return false;
      };
    })(gonLearningEvents = evtTools2.gonLearningEvents || (evtTools2.gonLearningEvents = {}));
  })(evtTools = gdjs2.evtTools || (gdjs2.evtTools = {}));
})(gdjs || (gdjs = {}));
