/**
 * A single ToDo in our list of Todos.
 * @typedef {Object} ToDo
 * @property {string} id - A unique ID to identify this todo.
 * @property {string} label - The text of the todo.
 * @property {boolean} isDone - Marks whether the todo is done.
 * @property {string} userId - The user who owns this todo.
 */

/**
 * A class which holds some constants for todo-list
 */
class ToDoList {
  static ID = 'todo-list';

  static FLAGS = {
    TODOS: 'todos'
  }

  static TEMPLATES = {
    TODOLIST: `modules/${this.ID}/templates/todo-list.hbs`
  }

  static SETTINGS = {
    INJECT_BUTTON: 'inject-button'
  }

  /**
   * A small helper function which leverages developer mode flags to gate debug logs.
   * 
   * @param {boolean} force - forces the log even if the debug flag is not on
   * @param  {...any} args - what to log
   */
  static log(force, ...args) {
    const shouldLog = force || game.modules.get('_dev-mode')?.api?.getPackageDebugValue(this.ID);

    if (shouldLog) {
      console.log(this.ID, '|', ...args);
    }
  }

  static initialize() {
    this.toDoListConfig = new ToDoListConfig();

    game.settings.register(this.ID, this.SETTINGS.INJECT_BUTTON, {
      config: true,
      default: true,
      hint: `TODO-LIST.settings.${this.SETTINGS.INJECT_BUTTON}.Hint`,
      name: `TODO-LIST.settings.${this.SETTINGS.INJECT_BUTTON}.Name`,
      onChange: () => ui.players.render(),
      scope: 'client',
      type: Boolean,
    });
  }
}


/**
 * Register our module's debug flag with developer mode's custom hook
 */
Hooks.once('devModeReady', ({ registerPackageDebugFlag }) => {
  registerPackageDebugFlag(ToDoList.ID);
});


/**
 * Once the game has initialized, set up our module
 */
Hooks.once('init', () => {
  ToDoList.initialize();
});


/**
 * The data layer for our todo-list module
 */
class ToDoListData {
  /**
   * get all toDos for all users indexed by the todo's id
   */
  static get allToDos() {
    const allToDos = game.users.reduce((accumulator, user) => {
      const userTodos = this.getToDosForUser(user.id);

      return {
        ...accumulator,
        ...userTodos
      }
    }, {});

    return allToDos;
  }

  /**
   * Gets all of a given user's ToDos
   * 
   * @param {string} userId - id of the user whose ToDos to return
   * @returns {Record<string, ToDo> | undefined}
   */
  static getToDosForUser(userId) {
    return game.users.get(userId)?.getFlag(ToDoList.ID, ToDoList.FLAGS.TODOS);
  }

  /**
   * 
   * @param {string} userId - id of the user to add this ToDo to
   * @param {Partial<ToDo>} toDoData - the ToDo data to use
   */
  static createToDo(userId, toDoData) {
    // generate a random id for this new ToDo and populate the userId
    const newToDo = {
      isDone: false,
      label: '',
      id: foundry.utils.randomID(16),
      userId,
      ...toDoData,
    }

    // construct the update to insert the new ToDo
    const newToDos = {
      [newToDo.id]: newToDo
    }

    // update the database with the new ToDos
    return game.users.get(userId)?.setFlag(ToDoList.ID, ToDoList.FLAGS.TODOS, newToDos);
  }

  /**
   * Updates a given ToDo with the provided data.
   * 
   * @param {string} toDoId - id of the ToDo to update
   * @param {Partial<ToDo>} updateData - changes to be persisted
   */
  static updateToDo(toDoId, updateData) {
    const relevantToDo = this.allToDos[toDoId];

    // construct the update to send
    const update = {
      [toDoId]: updateData
    }

    // update the database with the updated ToDo list
    return game.users.get(relevantToDo.userId)?.setFlag(ToDoList.ID, ToDoList.FLAGS.TODOS, update);
  }

  /**
   * Deletes a given ToDo
   * 
   * @param {string} toDoId - id of the ToDo to delete
   */
  static deleteToDo(toDoId) {
    const relevantToDo = this.allToDos[toDoId];

    // Foundry specific syntax required to delete a key from a persisted object in the database
    const keyDeletion = {
      [`-=${toDoId}`]: null
    }

    // update the database with the updated ToDo list
    return game.users.get(relevantToDo.userId)?.setFlag(ToDoList.ID, ToDoList.FLAGS.TODOS, keyDeletion);
  }

  /**
   * Updates the given user's ToDos with the provided updateData. This is
   * useful for updating a single user's ToDos in bulk.
   * 
   * @param {string} userId - user whose todos we are updating
   * @param {object} updateData - data passed to setFlag
   * @returns 
   */
  static updateUserToDos(userId, updateData) {
    return game.users.get(userId)?.setFlag(ToDoList.ID, ToDoList.FLAGS.TODOS, updateData);
  }
}

/**
 * The custom FormApplication subclass which displays and edits ToDos
 */
class ToDoListConfig extends FormApplication {
  /**
   * @override
   */
  static get defaultOptions() {
    const defaults = super.defaultOptions;

    const overrides = {
      closeOnSubmit: false,
      height: 'auto',
      id: 'todo-list',
      submitOnChange: true,
      template: ToDoList.TEMPLATES.TODOLIST,
      title: 'To Do List',
      userId: game.userId,
    };

    const mergedOptions = foundry.utils.mergeObject(defaults, overrides);

    return mergedOptions;
  }

  /**
   * Callback passed to Button Click event listener which handles it
   * 
   * @param {MouseEvent} event - the triggering mouse click event
   */
  async _handleButtonClick(event) {
    const clickedElement = $(event.currentTarget);
    const action = clickedElement.data().action;
    const toDoId = clickedElement.parents('[data-todo-id]')?.data()?.todoId;

    ToDoList.log(false, 'Button Clicked!', { this: this, action, toDoId });

    switch (action) {
      case 'create': {
        await ToDoListData.createToDo(this.options.userId);
        this.render();
        break;
      }

      case 'delete': {
        const confirmed = await Dialog.confirm({
          content: game.i18n.localize("TODO-LIST.confirms.deleteConfirm.Content"),
          title: game.i18n.localize("TODO-LIST.confirms.deleteConfirm.Title"),
        });

        if (confirmed) {
          await ToDoListData.deleteToDo(toDoId);
          this.render();
        }

        break;
      }

      default:
        ToDoList.log(false, 'Invalid action detected', action);
    }
  }

  /**
   * @override
   */
  activateListeners(html) {
    super.activateListeners(html);

    html.on('click', "[data-action]", this._handleButtonClick.bind(this));
  }

  /**
   * @override
   */
  getData(options) {
    return {
      todos: ToDoListData.getToDosForUser(options.userId)
    }
  }

  /**
   * @override
   */
  async _updateObject(event, formData) {
    const expandedData = foundry.utils.expandObject(formData);

    ToDoList.log(false, 'saving', {
      expandedData,
      formData,
    });

    await ToDoListData.updateUserToDos(this.options.userId, expandedData);
  }
}


Hooks.on('renderPlayerList', (playerList, html) => {
  // if the INJECT_BUTTON setting is false, return early
  if (!game.settings.get(ToDoList.ID, ToDoList.SETTINGS.INJECT_BUTTON)) {
    return;
  }

  // find the element which has our logged in user's id
  const loggedInUserListItem = html.find(`[data-user-id="${game.userId}"]`)

  // create localized tooltip
  const tooltip = game.i18n.localize('TODO-LIST.button-title');

  // insert a button at the end of this element
  loggedInUserListItem.append(
    `<button type='button' class='todo-list-icon-button flex0' title="${tooltip}">
      <i class='fas fa-tasks'></i>
    </button>`
  );

  // register an event listener for this button
  html.on('click', '.todo-list-icon-button', (event) => {
    const userId = $(event.currentTarget).parents('[data-user-id]')?.data()?.userId;

    ToDoList.toDoListConfig.render(true, { userId });
  });
});
