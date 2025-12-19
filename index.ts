import type { 
  AdminForthResource, 
  IAdminForth,
  IHttpServer,
} from "adminforth";
import clone from 'clone';

import { AdminForthPlugin, AdminForthResourcePages, suggestIfTypo } from "adminforth";
import { PluginOptions } from "./types.js";
import { interpretResource, ActionCheckSource } from "adminforth";

export default class ForeignInlineListPlugin extends AdminForthPlugin {
  foreignResource: AdminForthResource;
  copyOfForeignResource: AdminForthResource;
  options: PluginOptions;
  adminforth: IAdminForth;

  activationOrder: number = -10000000;

  constructor(options: PluginOptions) {
    super(options, import.meta.url);
    this.options = options;
  }

  instanceUniqueRepresentation(pluginOptions: any) : string {
    return `${pluginOptions.foreignResourceId}`;
  }

  setupEndpoints(server: IHttpServer) {
    console.log("Setting up endpoints for plugin", this.pluginInstanceId);
    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/get_default_filters`,
      handler: async ({body}) => {
        if (!this.options.defaultFilters) {
          return { error: 'No default filters function defined', ok: false };
        }
        const record = body.record;
        if (!record) {
          return { error: 'No record provided in request body', ok: false };
        }
        const filters = this.options.defaultFilters(record);
        if (!Array.isArray(filters)) {
          throw new Error('defauiltFilters must return an array of FilterParams');
        }
        return {ok: true, filters};
      }
    })
  }

  async modifyResourceConfig(adminforth: IAdminForth, resourceConfig: AdminForthResource) {
    super.modifyResourceConfig(adminforth, resourceConfig);
    this.adminforth = adminforth;
    this.foreignResource = adminforth.config.resources.find((resource) => resource.resourceId === this.options.foreignResourceId);

    if (!this.foreignResource) {
      const similar = suggestIfTypo(adminforth.config.resources.map((res) => res.resourceId), this.options.foreignResourceId);
      throw new Error(`ForeignInlineListPlugin: Resource with ID "${this.options.foreignResourceId}" not found. ${similar ? `Did you mean "${similar}"?` : ''}`);
    }
    const idOfNewCopy = `${this.foreignResource.resourceId}_inline_list__from_${this.resourceConfig.resourceId}__`;
    

    const newColumn = {
      name: `foreignInlineList_${this.foreignResource.resourceId}`,
      label: 'Foreign Inline List',
      virtual: true,
      showIn: {
        show: true,
        list: false,
        edit: false,
        create: false,
        filter: false,
      },
      components: {
        showRow: { 
          file: this.componentPath('InlineList.vue'),
          meta: {
            defaultFiltersOn: this.options.defaultFilters ? true : false,
            ...this.options, 
            pluginInstanceId: this.pluginInstanceId,
            disableForeignListResourceRefColumn: this.options.disableForeignListResourceRefColumn,
            foreignResourceId: idOfNewCopy
          }
        }
      },
    };

    if (this.options.placeInGroup?.name) {
      const fieldGroupTypes = [
        'fieldGroups',
        'createFieldGroups', 
        'editFieldGroups',
        'showFieldGroups'
      ] as const;

      let columnAdded = false;
      
      for (const groupType of fieldGroupTypes) {
        const targetGroup = resourceConfig.options?.[groupType]?.find(
          group => group.groupName === this.options.placeInGroup?.name
        );
        
        if (targetGroup) {
          if (this.options.placeInGroup.position < 0 || this.options.placeInGroup.position > targetGroup.columns.length) {
            throw new Error(`ForeignInlineListPlugin: Invalid position ${this.options.placeInGroup?.position}. Must be between 0 and ${targetGroup.columns.length} for group "${this.options.placeInGroup?.name}"`);
          }

          // Only add the column to resourceConfig.columns once
          if (!columnAdded) {
            const beforeColumnName = targetGroup.columns[this.options.placeInGroup.position - 1];
            const beforeColumnIndex = resourceConfig.columns.findIndex(
              col => col.name === beforeColumnName
            );
            resourceConfig.columns.splice(beforeColumnIndex + 1, 0, newColumn);
            columnAdded = true;
          }

          // Add the column name to the group's columns array
          targetGroup.columns.splice(this.options.placeInGroup.position, 0, newColumn.name);
        }
      }
    } else {
      resourceConfig.columns.push(newColumn);
    }

    // get resource with foreignResourceId
    this.copyOfForeignResource = clone({ ...this.foreignResource, plugins: [] });

    // if we install on plugin which is already a copy, adjust foreignResource references
    if (this.resourceConfig.resourceId.includes('_inline_list__from_')) {
      const originalResourceIdPart = this.resourceConfig.resourceId.split('_inline_list__from_')[0];
      // find column in copied resource which is foreignResource.resourceId equal to originalResourceIdPart
      // and change it to point to this.resourceConfig.resourceId
      const foreignRefColumn = this.copyOfForeignResource.columns.find(col => col.foreignResource?.resourceId === originalResourceIdPart);
      if (foreignRefColumn) {
        foreignRefColumn.foreignResource.resourceId = this.resourceConfig.resourceId;
      }
    }

    // if foreignInlineList_ column already created, remove it
    this.copyOfForeignResource.columns = this.copyOfForeignResource.columns.filter(col => !col.name.startsWith('foreignInlineList_'));
    // we should not cate about modifications made by other plugins, while activationOrder of this plugin is very low (negative)

    this.copyOfForeignResource.resourceId = idOfNewCopy;
    adminforth.config.resources.push(this.copyOfForeignResource);

    if (this.options.modifyTableResourceConfig) {
      this.options.modifyTableResourceConfig(this.copyOfForeignResource);
    }

    // now we need to create a copy of all plugins of foreignResource,
    for (const plugin of this.foreignResource.plugins || []) {
      const options = plugin.pluginOptions;
      // call constructor
      const pluginCopy = new (plugin.constructor as any)(options);
      this.copyOfForeignResource.plugins.push(pluginCopy);
    }

    // activate plugins for the copyOfForeignResource
    for (const plugin of this.copyOfForeignResource.plugins.sort((a, b) => a.activationOrder - b.activationOrder)) {
      // if there already is a plugin with same instanceUniqueRepresentation, skip
      if (plugin.modifyResourceConfig) {
        await plugin.modifyResourceConfig(adminforth, this.copyOfForeignResource);
      }
      if (plugin.setupEndpoints) {
        await plugin.setupEndpoints(adminforth.express);
      }
      if (plugin.validateConfigAfterDiscover) {
        await plugin.validateConfigAfterDiscover(adminforth, this.copyOfForeignResource);
      }
    }


  }
}