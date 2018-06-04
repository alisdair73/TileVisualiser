sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"org/atTileVisualiser/model/models",
	"sap/m/Title",
	"sap/m/GenericTile",
	"sap/ui/layout/HorizontalLayout",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function(Controller,Model,Title,Tile,HorizontalLayout,JSONModel,Filter,FilterOperator) {
	"use strict";

	return Controller.extend("org.atTileVisualiser.controller.RoleSelection", {

		onInit:function(){
			this.getView().setModel(
				new JSONModel({
					"TileName":"",
					"GroupName":"",
					"CatalogName":"",
					"UserName":"",
					"AssociationType":"GROUP",
					"ShowAll":false
				}),"RoleFilter");
				
			this.getView().setModel(new JSONModel({"searchString":""}),"RoleSearch");
			this.getView().setModel(new JSONModel([]),"Roles");
			this.getView().setModel(new JSONModel([]).setDefaultBindingMode(sap.ui.model.BindingMode.OneWay),"CandidateRole");

			sap.ui.core.UIComponent.getRouterFor(this).getRoute("RoleSelection").attachPatternMatched(this._onRouteMatched, this);
		},

		onFilterRole : function(oEvent) {
			
			var searchString = oEvent.getParameter("query");
			var filter = null;

			if (searchString && searchString !== "" ) {
				filter = new Filter([
					new Filter("RoleName", FilterOperator.Contains, searchString),
					new Filter("Description", FilterOperator.Contains, searchString)
				], false);
			}
			this.getView().byId("sourceRoles").getBinding("rows").filter(filter);

		},
		
		onShowAll:function(event){
			this._buildFLP();
		},
		
		onRefreshFLP: function(){
			this._buildFLP();
		},
		
		onSearch:function(event){
			
			var statement = "";
			var groupName = this.getView().getModel("RoleFilter").getProperty("/GroupName");
			var catalogName = this.getView().getModel("RoleFilter").getProperty("/CatalogName");
			var tileName = this.getView().getModel("RoleFilter").getProperty("/TileName");
			var userName = this.getView().getModel("RoleFilter").getProperty("/UserName").toUpperCase();
			
			var userNameMatch = userName !== "" ? "<--(u:User)":"";
			var userNameWhere = userName !== "" ? " and u.nodeId =~ '.*" + userName + ".*'":"";
			
			if (groupName === "" && catalogName === ""){
				statement = "match (t:Tile)<--(:Group)<--(r:Role)" + userNameMatch + " where " +
							"t.name =~ '.*" + tileName + ".*'" + userNameWhere + " return distinct r " +
							"UNION " +
							"match (t:Tile)<--(:Catalog)<--(r:Role)" + userNameMatch + " where " +
							"t.name =~ '.*" + tileName + ".*'" + userNameWhere + " return distinct r";
			} else if(groupName !== "" && catalogName !== "") {
				statement = "match (t:Tile)<--(c:Catalog)<--(r:Role)" + userNameMatch + 
							" , (t)<--(g:Group)<--(r) where " + 
							"t.name =~ '.*" + tileName + ".*'" + userNameWhere + " and " +
							"c.nodeId =~ '.*" + catalogName + ".*' and g.nodeId =~ '.*" + groupName + ".*' " +
							"return distinct r ";
				
			} else {
				if(groupName !== ""){
					statement = "match (t:Tile)<--(g:Group)<--(r:Role)" + userNameMatch + " where " + 
								"t.name =~ '.*" + tileName + ".*'" + userNameWhere + " and " +
								"g.nodeId =~ '.*" + groupName + ".*' " +
								"return distinct r ";
				} else {
					statement = "match (t:Tile)<--(c:Catalog)<--(r:Role)" + userNameMatch + " where " + 
								"t.name =~ '.*" + tileName + ".*'" + userNameWhere + " and " +
								"c.nodeId =~ '.*" + catalogName + ".*' " +
								"return distinct r ";	
				}
			}
			
			this.getView().byId("launchpad").destroyContent();
			this._queryNeo4j(
				{"statements":[{"statement":statement}]},
				this._buildRoleTable.bind(this)
			);
		},
		
		onFilter: function(oEvent) {
			
    		var key = oEvent.getParameter("selectedKey");
    		this.getView().getModel("RoleFilter").setProperty("/AssociationType",key);
    		this._buildFLP();
    	},

		onAssign:function(event) {
			
			var sourceRoleTable = this.getView().byId("sourceRoles");
			var rowIndex = sourceRoleTable.getSelectedIndex();
			
			if (rowIndex === -1) {
				return;
			} else {
				
				var rolePath = sourceRoleTable.getContextByIndex(rowIndex).getPath();
				
            	this.getView().getModel("Roles").setProperty(rolePath + "/Assigned", true);
				this.getView().getModel("Roles").refresh(true);
				
				this._buildFLP();
			}
		},
		
		onShowCandidateRole: function(){
			
			//Get All Roles in Launchpad Simulation
			var candidateLaunchpadGroups = this.getView().byId("launchpad").getContent();
			var neo4jQuery = { "statements":[] };
			
			candidateLaunchpadGroups.forEach(function(group){
				//For each Group - Find the Tiles, and then the Catalogs that have these Tiles
				var statement = "match (g:Group {nodeId:'" + group.getId() + "'})-->(t:Tile)<--(c:Catalog) return g,t,c";
				neo4jQuery.statements.push({"statement":statement});
			});
			
			this._queryNeo4j(
				neo4jQuery,
				this._openCandidateRoleDialog.bind(this)
			);
		},
		
		onCloseCandidateRole: function(){
			this._roleDialog.close();
		},
		
		_openCandidateRoleDialog: function(neo4jResults){
			
			var candidateRole = [];
			
			//Build the Display Model
			neo4jResults.results.forEach(function(result){
				result.data.forEach(function(match){
					
					//Group
					var groupId = match.row[0].nodeId;
					var groupName = match.row[0].name;
		
					//Tile
					var tileName = match.row[1].name;
	
					//Catalog
					var catalogId = match.row[2].nodeId;
					var catalogName = match.row[2].name;
		
					candidateRole.push({
						"groupId":groupId,
						"groupName":groupName,
						"tileName":tileName,
						"catalogId":catalogId,
						"catalogName":catalogName
					});
				});
			});
			
			candidateRole.sort(function(a,b){
			
				if (a.groupId < b.groupId) return -1;
				if (a.groupId > b.groupId) return 1;
				if (a.tileName < b.tileName) return -1;
				if (a.tileName > b.tileName) return 1;
				if (a.catalogId < b.catalogId) return -1;
				if (a.catalogId > b.catalogId) return 1;
				return 0;
			});
			
			this.getView().getModel("CandidateRole").setSizeLimit(candidateRole.length);
			this.getView().getModel("CandidateRole").setProperty("/",candidateRole);
			
			if (!this._roleDialog) {
				this._roleDialog = sap.ui.xmlfragment("org.atTileVisualiser.fragment.RoleCandidate", this);
			}
			
			this.getView().addDependent(this._roleDialog);

			// toggle compact style
			this._roleDialog.open();
		},
		
		onAssignAll:function(){
			this._setRoleAssignedTo(true);
			this._buildFLP();
		},
		
		onReset:function(){
			this._setRoleAssignedTo(false);
			this.getView().byId("launchpad").destroyContent();
		},
		
		_setRoleAssignedTo:function(assigned){
			
			var roles = this.getView().getModel("Roles").getProperty("/");
			roles.forEach(function(role){
				role.Assigned = assigned;
			});
			this.getView().getModel("Roles").setProperty("/",roles);
			this.getView().getModel("Roles").refresh(true);	
		},
		
		_buildFLP: function(){
			
			var assignedRoles = this.getView().getModel("Roles").getProperty("/").filter(function(role){
				return role.Assigned;	
			});
			
			var neo4jQuery = { "statements":[] };
			
			assignedRoles.forEach(function(assignedRole){
				
				var tileName = "";
				if(!this.getView().getModel("RoleFilter").getProperty("/ShowAll")){
					tileName = this.getView().getModel("RoleFilter").getProperty("/TileName");
				}
				var statement = "";
				switch (this.getView().getModel("RoleFilter").getProperty("/AssociationType")) {
					case "GROUP":
						statement = 
							"match (r:Role)-->(g:Group)-->(t:Tile) " + 
							"where r.name = \"" + assignedRole.RoleName + "\" and t.name =~ '.*" + tileName + ".*' return r,g,t";
						break;
					case "CATALOG":
						statement = "match (r:Role)-->(c:Catalog)-->(t:Tile) " +
						"where r.name = \"" + assignedRole.RoleName + "\" and t.name =~ '.*" + tileName + ".*' return r,c,t";
						
						break;
					default:
				}
				neo4jQuery.statements.push({"statement":statement});
			}.bind(this));
			
			this._queryNeo4j(
				neo4jQuery,
				this._buildTileContainer.bind(this)
			);
		},
		
		_buildTileContainer: function(neo4jResults){
	
			var groups = [];
			var groupKeyList = [];
					
			if(neo4jResults.results.length === 0){
				return;
			}		
					
			neo4jResults.results.forEach(function(result){
			
				result.data.forEach(
					function(match){
					
						//Role
					    var roleName = match.row[0].name;
						var roleID = match.row[0].nodeId;
		
						//Group
						var groupName = match.row[1].name;
						var groupID = match.row[1].nodeId;
		
						//Tile
				        var tileName = match.row[2].name;
				        var tileType = match.row[2]["Tile Type"];
				        var tileSubtitle = match.row[2].Subtitle;
				        var tileIcon = match.row[2].Icon;
				        var tileID = match.row[2].nodeId;
				        var tileFooter = match.row[2].Footer;
				        
						var group = {};
						
						if (groupKeyList.indexOf(groupID) === -1){
							group ={
								"groupID":groupID,
								"groupName": groupName,
								"tiles":[],
								"tilesKeyList":[]
							};
							groups.push(group);
							groupKeyList.push(groupID);
						} else {
							group = groups[groupKeyList.indexOf(groupID)];
						}
						
						//Make sure Tile is unique in the group
						if (group.tilesKeyList.indexOf(tileID) === -1){
							group.tiles.push({
								"tileID":tileID,
								"tileName":tileName,
								"tileType":tileType,
								"tileSubtitle":tileSubtitle,
								"tileFooter":tileFooter,
								"tileIcon":tileIcon
							});
							group.tilesKeyList.push(tileID);
						}
					}
				);
			});
			
			this.getView().byId("launchpad").destroyContent();
			
			groups.forEach(function(group){

				var groupLayout = new sap.ui.layout.VerticalLayout(group.groupID,{"width":"100%"});
				var title = new Title({
				  "titleStyle":"H2",
				"text":group.groupName + " (" + group.groupID + ")"
				});	
				title.addStyleClass("sapUiTinyMarginBegin sapUiMediumMarginTop");
				
				groupLayout.addContent(
					new sap.m.FlexBox({
				  		"alignItems":"End",
						"justifyContent":"SpaceBetween",
						"width":"100%",
						"items":[
							title,
							new sap.m.Button({
								"icon":"sap-icon://decline", 
								"type":sap.m.ButtonType.Reject,
								"press":function(event) {
										event.getSource().getParent().getParent().destroy();
									}.bind(this)
							})
						]
					})
				);
			
			//	this.getView().byId("launchpad").addContent(title); 
			  var tileLayout = new HorizontalLayout({"allowWrapping":true});
	
			  group.tiles.forEach(function(tile){

			  	var flpTile = new Tile({
					"header":tile.tileName,
					"subheader":tile.tileSubtitle
			  	});
			  	flpTile.addStyleClass("sapUiTinyMarginBegin sapUiTinyMarginTop");
			  	
			  	if(tile.tileIcon || tile.tileFooter){
			  		flpTile.addTileContent(
			  			new sap.suite.ui.commons.TileContent({
			  				footer: tile.tileFooter,
	    					content: new sap.m.ImageContent({"src":tile.tileIcon})
						})
					);
			  	}
			  	
			  	if(tile.tileType === "Dynamic"){
			  		flpTile.destroyTileContent();
			  		flpTile.addTileContent(
			  			new sap.suite.ui.commons.TileContent({
			  				footer: tile.tileFooter,
	    					content: new sap.m.NumericContent({"value":"1,234","icon":tile.tileIcon})
						})
					);
			  	}
			  	
			  	if(tile.tileType === "Custom(KPI etc.)"){
				  	var microChart = new sap.suite.ui.microchart.ComparisonMicroChart({
				  		"size":"S",
				  		"scale":"M",
				  		"data":[
				  			new sap.suite.ui.microchart.ComparisonMicroChartData({"title":"Measure 1","value":34,"color":"Good"}),
				  			new sap.suite.ui.microchart.ComparisonMicroChartData({"title":"Measure 2","value":125,"color":"Error"}),
				  			new sap.suite.ui.microchart.ComparisonMicroChartData({"title":"Measure 3","value":97,"color":"Critical"})
				  		]	
				  	});
				  	flpTile.destroyTileContent();
			  		flpTile.addTileContent(
			  			new sap.suite.ui.commons.TileContent({
	    					content: microChart
						})
					);
			  	}
			  	
			  	tileLayout.addContent(flpTile);
			  });
			  groupLayout.addContent(tileLayout);
			  this.getView().byId("launchpad").addContent(groupLayout); 
			  
			}.bind(this));
		},

		onRemove:function(event) {

			var targetRoleTable = this.getView().byId("AssignedRoles");
			var rowIndex = targetRoleTable.getSelectedIndex();
			
			if (rowIndex === -1) {
				return;
			} else {
				
				var rolePath = targetRoleTable.getContextByIndex(rowIndex).getPath();
				
            	this.getView().getModel("Roles").setProperty(rolePath + "/Assigned", false);
				this.getView().getModel("Roles").refresh(true);
				
				this._buildFLP();
			}
		},
		
		_queryNeo4j:function(statements,success){
			
			var neo4jURL = "http://localhost:7474/db/data/transaction/commit";
			
			$.ajax({
    			type: 'POST',
    			url: neo4jURL,
    			data: JSON.stringify(statements),
    			contentType : "application/json",
                dataType : "json",
				async: false,
				beforeSend: 
					function (request){
            			request.setRequestHeader("Authorization", "Basic " + btoa("neo4j:Clojure31!"));
        			}
			}).done(success).fail(
				function(err) {
			    	if (err !== undefined) {
			    		var oErrorResponse = $.parseJSON(err.responseText);
			    		sap.m.MessageToast.show(oErrorResponse.message, {
			        		duration: 6000
			    		});
			    	} else {
			    		sap.m.MessageToast.show("Unknown error!");
			    	}
				}
			);
		},
		
		_buildRoleTable: function(neo4jResults){
		
			if(neo4jResults.results.length === 0){
				this.getView().getModel("Roles").setProperty("/",[]);
				return;
			}
			
			var roles = [];
			neo4jResults.results[0].data.forEach(function(match){
				//Add Role
				roles.push({
					"RoleName":match.row[0].name,
					"Description":match.row[0].Description,
					"Assigned":false
				});
			});
			this.getView().getModel("Roles").setProperty("/",roles);
		},
		
		_onRouteMatched: function() {

			//Initial Load of all Roles...(GROUP is the default)
			var statement = "match (r:Role)-->(:Group) return distinct r";
			this._queryNeo4j(
				{"statements":[{"statement":statement}]},
				this._buildRoleTable.bind(this)
			);
			

			/*this.getView().getModel().metadataLoaded().then(function() {
				this.getOwnerComponent().getModel().read(
					"/RoleSet", {
						success: function(oData) {
							
							var candidateRoles = [];
						
							oData.results.forEach(function(role){
								candidateRoles.push({
									"RoleName":role.RoleName,
									"Description":role.Description,
									"Assigned":false
								});
							});
							this.getView().getModel("Roles").setProperty("/",candidateRoles);
							
						}.bind(this),
						
						error: function() {
						}.bind(this)
					}
				);
			}.bind(this));*/
		}
	});
});