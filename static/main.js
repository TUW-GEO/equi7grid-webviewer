
// ---------------------------
// modifiable global variables
// ---------------------------
let map = null;
let popup = null;
let overlay = null;
let reprojMouse = false;
let toEqui7 = true;
let queryData = null;
let tileQueryOp = null;
let drawInteraction = null;
let lastPointerCoord = null;
let stdSampling = 500;

// 2D settings
let drawSource = null;

// 3D settings
let is3d = false;
let ol3d = null;
let scene = null;
let handler = null;
let camera = null;
let csHlPrimitive = null;


// -------------------------
// constant global variables
// -------------------------
// style settings
const fontFamily = "Segoe UI, Tahoma, Geneva, Verdana, sans-serif";
const hlFillColor = [223, 216, 17, 0.9]
const defaultStyle = {
  fillColor: "#ee869b",
  alpha: 0.4,
  strokeColor: "#311c3b",
  strokeWidth: 2,
  show_labels: false
};
const zoneColours = {
  "AF": "#ac8abc",
  "AN": "#9ba2bc",
  "AS": "#e3bc57",
  "EU": "#a8c873",
  "NA": "#6e92cc",
  "OC": "#9bc5af",
  "SA": "#cc8fa1"
}
const styleRegistry = {}

// grid settings
const layerRegistry = {}
const continents = ["AF", "AN", "AS", "EU", "OC", "NA", "SA"]
const tilingIds = ["T6", "T3", "T1"]
const initTilingIds = ["T6"]
const epsgMap = {27701: "AF", 27702: "AN", 27703:  "AS", 27704:  "EU", 
                 27705:  "NA", 27706:  "OC", 27707:  "SA"}

// fetch browser
const browser = bowser.getParser(window.navigator.userAgent);
const disable3d = browser.getBrowserName() != "Chrome";


// ---------------
// 2D map creation
// ---------------

function create2dOlMap(){
  const osmLayer = new ol.layer.Tile({
    source: new ol.source.OSM()
  });

  let view = new ol.View({
    center: ol.proj.fromLonLat([11, 51]),
    zoom: 5
  });

  drawSource = new ol.source.Vector();
  const drawLayer = new ol.layer.Vector({
    source: drawSource
  });
  drawLayer.setStyle(
    new ol.style.Style({
      stroke: new ol.style.Stroke({
        color: '#0077ff',
        width: 2
      }),
      fill: new ol.style.Fill({
        color: 'rgba(0,119,255,0.2)'
      })
    })
  );

  map = new ol.Map({
      target: 'map',
      layers: [osmLayer],
      view: view
  });
  map.addLayer(drawLayer);
}

function create2dPointerMove(){
  map.on('pointermove', e => {
    lastPointerCoord = e.coordinate;
    const coord = ol.proj.toLonLat(e.coordinate);
    document.getElementById('pointer-coords').innerHTML =
      `<b>Lon:</b> ${coord[0].toFixed(4)}, <b>Lat:</b> ${coord[1].toFixed(4)}`;
  });
}

function create2dSelectClick(){
  const selectClick = new ol.interaction.Select({
  condition: ol.events.click,
    style: selectStyle
  });
  map.addInteraction(selectClick);
}

function create2dPopup(){
  popup = document.getElementById('popup');
  overlay = new ol.Overlay({
    element: popup
  });
  map.addOverlay(overlay);
}

function create2dLeftClick(){
  map.on('click', function (evt) {
    if(!disable3d){
      if (ol3d.getEnabled()) return;
    }
    if (drawInteraction) return;
    
    map.forEachFeatureAtPixel(evt.pixel, function (feature) {
        const props = feature.getProperties();
        popup.innerHTML = props.name;
        overlay.setPosition(evt.coordinate);
    });
  });
}

function create2dRightClick(){
  map.getViewport().addEventListener('contextmenu', function (evt) {
    evt.preventDefault();
    if(drawInteraction){
      if (tileQueryOp !== 'POLY-DRAW') return;
      if (lastPointerCoord) {
        drawInteraction.appendCoordinates([lastPointerCoord]);
      }
      drawInteraction.finishDrawing();
    }
    else{
      const lonlat = ol.proj.toLonLat(map.getEventCoordinate(evt));
      if (reprojMouse & toEqui7){
        document.getElementById('x-coord-other').value = lonlat[0].toFixed(6);
        document.getElementById('y-coord-other').value = lonlat[1].toFixed(6);
        document.getElementById('other-crs').value = 4326;
        document.getElementById('x-coord-e7').value = "";
        document.getElementById('y-coord-e7').value = "";
      }
      navigator.clipboard.writeText(lonlat);

      Swal.fire({
        position: "top-end",
        icon: "success",
        title: '<span style="font-size: 18px;font-weight: bold;">Copied coordinate.</span>',
        showConfirmButton: false,
        timer: 1500,
        width: "400px"
      });
    }
  });
}

function createLabelStyle(feature, dsId) {
  const style = styleRegistry[dsId];
  rgb = hexToRgb(style.fillColor)
  rgba = [rgb.r, rgb.g, rgb.b, style.alpha]
  return new ol.style.Style({
    fill: new ol.style.Fill({
      color: rgba
    }),
    stroke: new ol.style.Stroke({
      color: style.strokeColor,
      width: style.strokeWidth
    }),
    text: style.show_labels ? new ol.style.Text({
        text: feature.get('name'),
        font: '12px ' + fontFamily,
        fill: new ol.style.Fill({ color: '#000' }),
        stroke: new ol.style.Stroke({
          color: '#fff',
          width: 3
        }),
        overflow: true
      }) : null
  });
}

function createOlVectorLayer(url, dsId) {
  const vectorSource = new ol.source.Vector({
      url,
      format: new ol.format.GeoJSON()
    })

  const vectorLayer = new ol.layer.Vector({
    source: vectorSource,
    visible: false
  });

  vectorLayer.setStyle(feature => createLabelStyle(feature, dsId));
  vectorSource.loadFeatures(
    map.getView().calculateExtent(map.getSize()),
    map.getView().getResolution(),
    map.getView().getProjection()
  );

  return vectorLayer
}

function create2d(){
  create2dOlMap();
  create2dSelectClick();
  create2dPointerMove();  
  create2dPopup();
  create2dLeftClick();
  create2dRightClick();
}


// ----------------
// 2D map functions
// ----------------
function drawPolygon(){
  if (drawInteraction){
    map.removeInteraction(drawInteraction);
  }
  drawInteraction = new ol.interaction.Draw({
    source: drawSource,
    type: 'Polygon'
  });
  map.addInteraction(drawInteraction);
}

function drawBoundingBox(){
  if (drawInteraction) {
    map.removeInteraction(drawInteraction);
  }
  drawInteraction = new ol.interaction.Draw({
    source: drawSource,
    type: 'Circle',
    geometryFunction: ol.interaction.Draw.createBox()
  });
  map.addInteraction(drawInteraction);
}

function clearDrawings(){
  drawSource.clear();
}

document.addEventListener('keydown', function (e){
  if (e.key === 'Escape' && drawInteraction){
    drawInteraction.abortDrawing();
  }
});

function selectStyle(feature) {
  if(!tileQueryOp){
    const dsId = createDsIdFromName(feature.getProperties().name)
    const selectedStyle = createLabelStyle(feature, dsId)
    if(dsId.includes("ZONE")){
      return selectedStyle;
    }else{
      selectedStyle.getFill().setColor(hlFillColor);
    return selectedStyle;
    }
  }
}

const bboxDrawBtn = document.getElementById('bbox-draw-button');
bboxDrawBtn.onclick = () => {
    clearDrawings();
    tileQueryOp = "BBOX-DRAW";    
    drawBoundingBox();
};

const polyDrawBtn = document.getElementById('poly-draw-button');
polyDrawBtn.onclick = () => {
    clearDrawings();
    tileQueryOp = "POLY-DRAW";
    drawPolygon();
};


// ---------------
// 3D map creation
// ---------------
async function create3d(){
  if (!disable3d){
    ol3d = new olcs.OLCesium({ map, 
      synchronize: false 
    });

    scene = ol3d.getCesiumScene();
    handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    camera = scene.camera;

    handler.setInputAction(movement => {
      if (!ol3d.getEnabled()) return;

      if(csHlPrimitive){
        scene.primitives.remove(csHlPrimitive);
        csHlPrimitive.destroy();
      }

      const picked = scene.pick(movement.position);
      if (!picked || !picked.id) return;

      const dsId = createDsIdFromName(picked.id);
      if(dsId.includes("ZONE")){return};
      const feature = layerRegistry[dsId]["ol"].getSource().getFeatures().find(f => f.get('name') === picked.id);
      if(feature){
        const coordinates = [];
        for (const coord of feature.getGeometry().getCoordinates()[0]){
          const lonlat = ol.proj.toLonLat(coord);
          coordinates.push(lonlat);
        }
        const csGeom = new Cesium.GeometryInstance({
            geometry: createCsPolygonFromGeoJSON(coordinates.flat()),
            id: picked.id
          })
        const csHlFillColor = new Cesium.Color(hlFillColor[0]/255., hlFillColor[1]/255., hlFillColor[2]/255., hlFillColor[3]);
        const csMaterial = new Cesium.Material({
          fabric: {
            type: 'Color',
            uniforms: {
              color: csHlFillColor
            }
          }
        });
        csHlPrimitive = new Cesium.GroundPrimitive({
          geometryInstances: [csGeom],
          appearance: new Cesium.MaterialAppearance({
              material: csMaterial
            })
        })
        csHlPrimitive.show = true;
        scene.primitives.add(csHlPrimitive);
        const positions = [];
        for (const point of coordinates){
          positions.push(Cesium.Cartesian3.fromDegrees(point[0], point[1], 0))
        }
        const center =
          Cesium.BoundingSphere.fromPoints(positions
          ).center
        popup.innerHTML = picked.id
        const cntrCoord = convertCsToOlCoordinate(center);
        overlay.setPosition(cntrCoord);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  } 
}

async function init3d(){
  await create3d();
}

async function createCsSource(id, url, style, createDs){
  const csPrimitives = null;
  if(disable3d || !createDs){return csPrimitives;};
  const geojson = await fetch(url).then(r => r.json());
  const polyPrimitive = createCsPolygonLayer(geojson, style);
  const outlinePrimitive = createCsOutlines(geojson, style);
  const labelPrimitive = createCsLabels(geojson);
  polyPrimitive.show = false;
  outlinePrimitive.show = false;
  labelPrimitive.show = false;

  scene.primitives.add(polyPrimitive);
  scene.primitives.add(outlinePrimitive);
  scene.primitives.add(labelPrimitive);
  
  return [polyPrimitive, outlinePrimitive, labelPrimitive]
}

function createCsPolygonFromGeoJSON(coords){
  return Cesium.PolygonGeometry.fromPositions({
    positions: Cesium.Cartesian3.fromDegreesArray(coords.flat()),
    vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT
  });
}

function createCsPolygonLayer(geojson, style){
  const instances = [];

  for(const f of geojson.features){
    const positions = f.geometry.coordinates[0].flat()

    instances.push(
      new Cesium.GeometryInstance({
        geometry: createCsPolygonFromGeoJSON(positions),
        id: f.properties.name
      })
    );
  };

  rgb = hexToRgb(style.fillColor);
  rgba = [rgb.r, rgb.g, rgb.b, style.alpha];
  const csFillColor = new Cesium.Color(rgba[0]/255., rgba[1]/255., rgba[2]/255., rgba[3]);

  const csMaterial = new Cesium.Material({
    fabric: {
      type: 'Color',
      uniforms: {
        color: csFillColor
      }
    }
  });

  return new Cesium.GroundPrimitive({
    geometryInstances: instances,
    appearance: new Cesium.MaterialAppearance({
        material: csMaterial
      })
  });
}

function createCsOutlines(geojson, style){
  const instances = [];

  for(const f of geojson.features){
    if (f.geometry.type !== 'Polygon') return;

    const positions = Cesium.Cartesian3.fromDegreesArray(  
      f.geometry.coordinates[0].flat()
    );

    instances.push(
      new Cesium.GeometryInstance({
        geometry: new Cesium.GroundPolylineGeometry({
          positions,
          width: style.strokeWidth
        }),
      })
    );
  };

  rgb = hexToRgb(style.strokeColor);
  rgba = [rgb.r, rgb.g, rgb.b, style.alpha];
  const csStrokeColor = new Cesium.Color(rgba[0]/255., rgba[1]/255., rgba[2]/255., rgba[3]);

  const csMaterial = new Cesium.Material({
    fabric: {
      type: 'Color',
      uniforms: {
        color: csStrokeColor
      }
    }
  });

  return new Cesium.GroundPolylinePrimitive({
    geometryInstances: instances,
    appearance: new Cesium.PolylineMaterialAppearance({
        material: csMaterial
      })
  });
}

function createCsLabels(geojson){
  const labels = new Cesium.LabelCollection();

  for(const f of geojson.features){
    const positions = [] 
    for (const point of f.geometry.coordinates[0]){
      positions.push(Cesium.Cartesian3.fromDegrees(point[0], point[1], 0))
    }

    const center =
      Cesium.BoundingSphere.fromPoints(positions
      ).center;

    labels.add({
      position: center,
      text: f.properties.name,
      font: '14px ' + fontFamily,
      fillColor: Cesium.Color.BLACK,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER
    });
  };

  return labels
}


// ----------------
// 3D map functions
// ----------------  
async function addZones3d(dsId){
  const layer = layerRegistry[dsId];
  const style = styleRegistry[dsId];
  const continent = dsId.split("_")[0]
  const csURL = `/createGeoms?continent=${continent}&env=cs`;
  const csPrimitives = await createCsSource(dsId, csURL, style, layer.visible);
  layer.cesium = csPrimitives;
  if(layer.cesium){
    layer.cesium[0].show = true;
    layer.cesium[1].show = true;
  }
}

function delZones3d(dsId){
  const layer = layerRegistry[dsId];
  if(layer.cesium){
      for(const primitive of layer.cesium){
        scene.primitives.remove(primitive);
        primitive.destroy();
      }
      layer.cesium = null;
  } 
}

async function updateZones3d(addZone){
  for(const dsId of Object.keys(layerRegistry)){
    if(!dsId.includes("ZONE")){continue;};
    if(addZone){
      addZones3d(dsId);
    }else{
      delZones3d(dsId);
    }
  }
}

const zoomIn3D = document.getElementById('zoom-in');
const zoomOut3D = document.getElementById('zoom-out');
const toggle3dIcon = document.getElementById('toggle-3d-icon');

zoomIn3D.onclick = () => {
    camera.zoomIn(camera.positionCartographic.height * 0.2);
  };

zoomOut3D.onclick = () => {
    camera.zoomOut(camera.positionCartographic.height * 0.2);
  };

toggle3dIcon.onclick = () => {
  if (!disable3d){
    set3D(!is3d);
    toggle3dIcon.innerText = is3d ? '\uD83D\uDDFA\uFE0F' : '\uD83C\uDF0D';

    if(is3d){
      zoomIn3D.style.display = "block";
      zoomOut3D.style.display = "block";
    }
    else{
      zoomIn3D.style.display = "none";
      zoomOut3D.style.display = "none";
    }
  }
  else{
    Swal.fire({
      icon: "error",
      title: "3D view disabled.",
      text: "3D view is not available in " + `${browser.getBrowserName()}` + ". You need to use Chrome."
    });
  }
}

function applyCsLabels(csPrimitives, activate) {
  if (!csPrimitives) return;
  csPrimitives[2].show = activate;
}

function moveCsCredits() {
  const sceneCredits = ol3d.getCesiumScene();

  if (!sceneCredits || !sceneCredits.canvas) return;

  const root = sceneCredits.canvas.parentElement;
  if (!root) return;

  const creditContainer = [...root.children].find(el =>
    el.querySelector && el.querySelector('.cesium-credit-logoContainer')
  );

  if (!creditContainer) {
    console.warn('Cesium credit wrapper not found');
    return;
  }

  creditContainer.style.left = 'auto';
  creditContainer.style.right = '10px';
  creditContainer.style.bottom = '10px';
  creditContainer.style.top = 'auto';
  creditContainer.style.textAlign = 'right';
  creditContainer.style.paddingRight = '0';
}


// ---------------------
// 2D & 3D map functions
// ---------------------
async function set3D(enabled) {
  is3d = enabled;
  await updateZones3d(enabled);
  ol3d.setEnabled(enabled);

  Object.values(layerRegistry).forEach(layer => {
    if (layer.ol) {
      layer.ol.setVisible(!enabled && layer.visible);
    }
    if (layer.cesium) {
      layer.cesium[0].show = enabled && layer.visible;
      layer.cesium[1].show = enabled && layer.visible;
    }
  });

  applyLayerOrder(".tiling-item");

  map.getInteractions().forEach(i =>
    i.setActive(!enabled)
  );

  if(enabled){
    requestAnimationFrame(() => {
      requestAnimationFrame(moveCsCredits);
    });
  }
}

function highlightSingleTile(tile){
  if(queryData){
    queryData.forEach(t => {
      const tileItem = document.getElementById(t);
      tileItem.classList.remove("active");
    });
  }

  updateStyles();

  if(csHlPrimitive){
    scene.primitives.remove(csHlPrimitive);
    csHlPrimitive.destroy();
  }

  const csGeom = highlightTile(tile);

  const csHlFillColor = new Cesium.Color(hlFillColor[0]/255., hlFillColor[1]/255., hlFillColor[2]/255., hlFillColor[3]);
    const csMaterial = new Cesium.Material({
      fabric: {
        type: 'Color',
        uniforms: {
          color: csHlFillColor
        }
      }
    });

  csHlPrimitive = new Cesium.GroundPrimitive({
      geometryInstances: [csGeom],
      appearance: new Cesium.MaterialAppearance({
          material: csMaterial
        })
    })
    csHlPrimitive.show = true;

  scene.primitives.add(csHlPrimitive);
}

function highlightTile(tile){
  const tileItem = document.getElementById(tile);
  tileItem.classList.toggle("active");

  const dsId = createDsIdFromName(tile);
  const feature = layerRegistry[dsId]["ol"].getSource().getFeatures().find(f => f.get('name') === tile);
  if(feature){
    const selectedStyle = createLabelStyle(feature, dsId)
    selectedStyle.getFill().setColor(hlFillColor);
    feature.setStyle(selectedStyle);

    const coordinates = [];
    for (const coord of feature.getGeometry().getCoordinates()[0]){
      const lonlat = ol.proj.toLonLat(coord);
      coordinates.push(lonlat);
    }
    
    const csGeom = new Cesium.GeometryInstance({
        geometry: createCsPolygonFromGeoJSON(coordinates.flat()),
        id: tile
      })

    return csGeom;
  }
}


document.getElementById('query-tiles').onclick = async () => {
  const sampling = document.getElementById("sampling-input").value;
  if (sampling){
    if(sampling != stdSampling){
      await fetch(
      `/updateSampling?sampling=${sampling}`
    )
    stdSampling = sampling;
    }
  } 

  updateStyles();
  
  if(!tileQueryOp){
      const bboxWrapper = document.getElementById('bbox-container');
      const bboxActive = bboxWrapper.style.display == "grid";
      if(bboxActive){
        tileQueryOp = "BBOX";
      }
      else{
        return
      }
  } 
  map.removeInteraction(drawInteraction);
  drawInteraction = null;

  const tiling_id = document.getElementById("tiles-tiling").value;
  let res;
  if(tileQueryOp == "BBOX"){
    const east = document.getElementById('bbox_e').value
    const south = document.getElementById('bbox_s').value
    const west = document.getElementById('bbox_w').value
    const north = document.getElementById('bbox_n').value
    res = await fetch(
      `/queryTilesFromBbox?east=${east}&south=${south}&west=${west}&north=${north}&tiling_id=${tiling_id}`
    );
  }
  else{
    const feature = drawSource.getFeatures()[0];
    const wkt = new ol.format.WKT();
    const wktGeom = wkt.writeGeometry(feature.getGeometry());
    res = await fetch(
      `/queryTilesFromWkt?wkt=${wktGeom}&tiling_id=${tiling_id}`
    );
  }
  
  const data = await res.json();
  const list = document.getElementById('tile-list');
  list.innerHTML = '';

  if(csHlPrimitive){
    scene.primitives.remove(csHlPrimitive);
    csHlPrimitive.destroy();
  }
  const csGeoms = [];
  data.forEach(tile => {
    const li = document.createElement('li');
    li.className = 'tile-item';
    li.id = tile;
    li.innerHTML = `
    <span onclick="highlightSingleTile('${tile}');">${tile}</span>
    <span onclick="copyTraffo('${tile}');">\uD83C\uDF10</span>
    <span onclick="copyPython('${tile}');">\uD83D\uDC0D</span>`;
    list.appendChild(li);

    const csGeom = highlightTile(tile);
    csGeoms.push(csGeom);
  });

  const csHlFillColor = new Cesium.Color(hlFillColor[0]/255., hlFillColor[1]/255., hlFillColor[2]/255., hlFillColor[3]);
    const csMaterial = new Cesium.Material({
      fabric: {
        type: 'Color',
        uniforms: {
          color: csHlFillColor
        }
      }
  });
  csHlPrimitive = new Cesium.GroundPrimitive({
    geometryInstances: csGeoms,
    appearance: new Cesium.MaterialAppearance({
      material: csMaterial
    })
  })
  csHlPrimitive.show = true;
  scene.primitives.add(csHlPrimitive);
  queryData = data;
  clearDrawings();
  tileQueryOp = null;
};


async function registerDataset(id, url){
  const olURL = url + "&env=ol"
  if (!(id in styleRegistry)){
    styleRegistry[id] = {...defaultStyle};
  }
  const style = styleRegistry[id];
  
  const olLayer = createOlVectorLayer(olURL, id);
  map.addLayer(olLayer);

  const olSource = olLayer.getSource();
  await new Promise(resolve => {
    if (olSource.getState() === 'ready'){
      resolve();
    } else {
      olSource.once('featuresloadend', resolve);
    }
  });

  const csURL = url + "&env=cs"
  const isZone = !url.includes("tiling_id");
  const csPrimitives = await createCsSource(id, csURL, style, !isZone);

  layerRegistry[id] = {
    ol: olLayer,
    cesium: csPrimitives,
    visible: false
  };
}

async function setLayerVisible(dsId, visible){
  const layer = layerRegistry[dsId];
  if (!layer) return;
  layer.visible = visible;

  const isZone = dsId.includes("ZONE");
  if(is3d && isZone && visible){
    await addZones3d(dsId);
  }
  else if(is3d && isZone && !visible){
    delZones3d(dsId);
  }
  
  if (layer.ol) {
    if(!disable3d){
      layer.ol.setVisible(!ol3d.getEnabled() && visible);
    }else{
      layer.ol.setVisible(visible);
    }
  }

  if (layer.cesium) {
    layer.cesium[0].show = ol3d.getEnabled() && visible;
    layer.cesium[1].show = ol3d.getEnabled() && visible;
  }
}

async function loadTiling(){
  const continent = document.getElementById('continent-selection').value;
  const tilingId = document.getElementById('tiling-id').value;
  const tileSize = document.getElementById('tilesize').value;
  if (!continent) return;

  const dsId = continent + "_" + tilingId
  if (!(dsId in layerRegistry)){
    await registerDataset(dsId, `/createGeoms?continent=${continent}&tiling_id=${tilingId}&tile_size=${tileSize}`)
    renderLayerSwitcher();
    updateStyles();

    const tilingElem = document.createElement("option");
    tilingElem.value = tilingId;
    tilingElem.innerText = tilingId;
    const selectContTiling = document.getElementById(`select-tiling-${continent.toLowerCase()}`);
    selectContTiling.appendChild(tilingElem);
  }
}

document.getElementById('load-tiling').onclick = async () => {
  startLoader();
  await loadTiling();
  endLoader();
};

async function init_zones(){
  for (const continent of continents){
    const dsId = continent + "_ZONE"
    let zoneStyle = {};
    zoneStyle = {...defaultStyle};
    zoneStyle.fillColor = zoneColours[continent];
    styleRegistry[dsId] = zoneStyle;
    await registerDataset(dsId, `/createGeoms?continent=${continent}`);
  }
  renderLayerSwitcher();
}

async function init_standard_grids(){
  for (const continent of continents){
    for (const tilingId of initTilingIds){  
        const dsId = continent + "_" + tilingId
        await registerDataset(dsId, `/createGeoms?continent=${continent}&tiling_id=${tilingId}`);
    }
  }
  renderLayerSwitcher();
  updateStyles();
}

async function initLayers(){
  startLoader();
  await init_zones();
  await init_standard_grids();
  endLoader();
}

function convertCsToOlCoordinate(cartesian) {
  const csCarto = Cesium.Cartographic.fromCartesian(cartesian);
  return ol.proj.fromLonLat([
    Cesium.Math.toDegrees(csCarto.longitude),
    Cesium.Math.toDegrees(csCarto.latitude)
  ]);
}

function labelTiles(checked){
  Object.keys(layerRegistry).forEach(dsId => {
    styleRegistry[dsId].show_labels=checked;
    updateStyle(dsId)
  })

  Object.values(layerRegistry).forEach(layer => {
    if (layer.visible){
      applyCsLabels(layer["cesium"], checked)
    }
    });
}

function showZones(checked){
  continents.forEach(continent => setLayerVisible(continent + "_ZONE", checked));
}

async function doAddDelPerTiling(continent, tilingId, remove){
    const dsId = continent + "_" + tilingId;
    const dsExists = Object.keys(layerRegistry).includes(dsId)
    if (!remove && !dsExists){
      url = `/createGeoms?continent=${continent}&tiling_id=${tilingId}`
      await registerDataset(dsId, url)
    }
    else if (remove && dsExists) {
      map.removeLayer(layerRegistry[dsId]["ol"]);
      if(!disable3d){
        scene.primitives.remove(layerRegistry[dsId]["cesium"][0]);
        scene.primitives.remove(layerRegistry[dsId]["cesium"][1]);
        scene.primitives.remove(layerRegistry[dsId]["cesium"][2]);
      }
      delete layerRegistry[dsId];
      delete styleRegistry[dsId];

      
      if(!tilingIds.includes(tilingId)){
      const selectContTiling = document.getElementById(`select-tiling-${continent.toLowerCase()}`);
      let childToRemove = null;
      let children = selectContTiling.children;
      for (var i = 0; i < children.length; i++) {
        if(children[i].value == tilingId){
          childToRemove = children[i];
          break
        }
      }
      selectContTiling.removeChild(childToRemove);
     }
    }
}

async function doAddDel(continent, tilingId, remove){
  let tilingIdsAddDel = null;
  if(tilingId == "all"){
    tilingIdsAddDel = tilingIds;
  }
  else{
    tilingIdsAddDel = [tilingId];
  }
  
  for(const tilingIdAddDel of tilingIdsAddDel){
    await doAddDelPerTiling(continent, tilingIdAddDel, remove);
  }

  renderLayerSwitcher();
  updateStyles();
}

function applyLayerOrder(itemName) {
  const dsIds = [...document.querySelectorAll(itemName)]
    .map(li => li.dataset.layerId);

  const layers = map.getLayers();
  dsIds.forEach((dsId, index) => {
    const olLayer = layerRegistry[dsId].ol;
    if (!olLayer) return;

    layers.remove(olLayer);
    layers.insertAt(index + 1, olLayer); // +1 if base layer at 0
  });

  dsIds.forEach(dsId => {
    const csPrimitives = layerRegistry[dsId].cesium;
    if (!csPrimitives) return;

    scene.primitives.raiseToTop(csPrimitives[0]);
    scene.primitives.raiseToTop(csPrimitives[1]);
    scene.primitives.raiseToTop(csPrimitives[2]);
  });
}

// update layer styles
function updateFillColor(dsId, fillColor){
  styleRegistry[dsId].fillColor = fillColor;
  console.log(styleRegistry);
  updateStyle(dsId);
  console.log(styleRegistry);
}

function updateStrokeWidth(dsId, strokeWidth){
  styleRegistry[dsId].strokeWidth = strokeWidth;
  updateStyle(dsId);
}

function updateStrokeColor(dsId, strokeColor){
  styleRegistry[dsId].strokeColor = strokeColor;
  updateStyle(dsId);
}

function updateStyle(dsId){
  const fillColorInput = document.getElementById(`FillColor_${dsId}`);
  if(fillColorInput){
    fillColorInput.value = styleRegistry[dsId]["fillColor"];
    const strokeColorInput = document.getElementById(`StrokeColor_${dsId}`);
    strokeColorInput.value = styleRegistry[dsId]["strokeColor"];
  }

  if(dsId.includes("ZONE")){
    return
  }
  const style = styleRegistry[dsId];

  layerRegistry[dsId]["ol"].setStyle(feature => createLabelStyle(feature, dsId));
  if(queryData){
    queryData.forEach(tile => {
      const feature = layerRegistry[dsId]["ol"].getSource().getFeatures().find(f => f.get('name') === tile);
      if(feature){
        const selectedStyle = createLabelStyle(feature, dsId)
        feature.setStyle(selectedStyle);
      }
    });
  }

  if(disable3d){return};

  const csPrimitives = layerRegistry[dsId]["cesium"]
  if(csPrimitives == null){return};

  rgb = hexToRgb(style.fillColor)
  rgba = [rgb.r, rgb.g, rgb.b, style.alpha]
  const csFillColor = new Cesium.Color(rgba[0]/255., rgba[1]/255., rgba[2]/255., rgba[3])
  rgb = hexToRgb(style.strokeColor)
  rgba = [rgb.r, rgb.g, rgb.b, style.alpha]
  const csStrokeColor = new Cesium.Color(rgba[0]/255., rgba[1]/255., rgba[2]/255., rgba[3])

  const csFillMaterial = new Cesium.Material({
    fabric: {
      type: 'Color',
      uniforms: {
        color: csFillColor
      }
    }
  });
  const csStrokeMaterial = new Cesium.Material({
    fabric: {
      type: 'Color',
      uniforms: {
        color: csStrokeColor
      }
    }
  });
  csPrimitives[0].appearance.material = csFillMaterial;
  csPrimitives[1].appearance.material = csStrokeMaterial;
}

function updateStyles(){
  Object.keys(styleRegistry).forEach(dsId => updateStyle(dsId));
}


// ----------------
// helper functions
// ----------------
function createDsIdFromName(name){
  let dsId = null; 
  if(name.includes("_")){
    dsId = name.substring(0, 2) + "_" + name.substring(name.length - 2, name.length)
  }
  else{
    dsId = name + "_ZONE";
  }

  return dsId
}

function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}


// ------------
// UI functions
// ------------
// update stroke settings and style
const strokeSlider = document.getElementById('stroke-width-slider');

strokeSlider.oninput = (e) => {
    Object.keys(styleRegistry).forEach(dsId => {
      styleRegistry[dsId].strokeWidth = e.target.value;
      updateStyle(dsId);
    });
};

// update opacity settings and style
const opacSlider = document.getElementById('opac-slider');

opacSlider.oninput = (e) => {
    Object.keys(styleRegistry).forEach(dsId => {
      styleRegistry[dsId].alpha = e.target.value/100.;
      updateStyle(dsId);
    });
};

// copy all tiles in query result as tilenames to clipboard
document.getElementById('copy-tilenames-icon').onclick = () => {
  const tileList = document.getElementById('tile-list');
  const tilenames = [];
  for (const tileItem of tileList.childNodes){
      const tilename = tileItem.id;
      tilenames.push(tilename);
  }
  navigator.clipboard.writeText(tilenames.join("\n"));
  Swal.fire({
    position: "top-end",
    icon: "success",
    title: '<span style="font-size: 18px;font-weight: bold;">Copied tilenames.</span>',
    showConfirmButton: false,
    timer: 1500,
    width: "400px"
  });
}

// copy all tiles in query result as a dictionary of geotransformation parameters to clipboard
document.getElementById('copy-traffos-icon').onclick = async () => {
  const tileList = document.getElementById('tile-list');
  const traffos = {};
  for (const tileItem of tileList.childNodes){
      const tilename = tileItem.id;
      const res = await fetch(
        `/getGeoTraffo?tilename=${tilename}`
      );
      const data = await res.json();
      traffos[tilename] = data;
  }
  navigator.clipboard.writeText(JSON.stringify(traffos, null, '\t'));
  Swal.fire({
    position: "top-end",
    icon: "success",
    title: '<span style="font-size: 18px;font-weight: bold;">Copied geotransformation parameters.</span>',
    showConfirmButton: false,
    timer: 1500,
    width: "400px"
  });
}

async function copyTraffo(tile){
  const res = await fetch(
        `/getGeoTraffo?tilename=${tile}`
    );
  const data = await res.json();
  navigator.clipboard.writeText(data);
  Swal.fire({
    position: "top-end",
    icon: "success",
    title: '<span style="font-size: 18px;font-weight: bold;">Copied geotransformation parameters: \n' + data + '</span>',
    showConfirmButton: false,
    timer: 1500,
    width: "400px"
  });
}

// copy all tiles in query result as Python code generating Equi7Tile objects to clipboard
document.getElementById('copy-e7tiles-icon').onclick = async () => {
  const tileList = document.getElementById('tile-list');
  const e7Tiles = {};
  for (const tileItem of tileList.childNodes){
      const tilename = tileItem.id;
      const res = await fetch(
        `/getTileDef?tilename=${tilename}`
      );
      const data = await res.json();
      e7Tiles[tilename] = data;
  }
  const code_template = ` 
import json
from equi7grid._core import Equi7Tile

json_dict = json.loads('''${JSON.stringify(e7Tiles, null, '\t')}''')
e7tiles = {}
for tilename, tile_json in json_dict.items():
    e7tiles[tilename] = Equi7Tile(**tile_json)
    `
  navigator.clipboard.writeText(code_template);
  Swal.fire({
    position: "top-end",
    icon: "success",
    title: '<span style="font-size: 18px;font-weight: bold;">Copied Equi7Tile generation code.</span>',
    showConfirmButton: false,
    timer: 1500,
    width: "400px"
  });
}

async function copyPython(tile){
  const res = await fetch(
        `/getTileDef?tilename=${tile}`
    );
  const data = await res.json();
  const code_template = ` 
import json
from equi7grid._core import Equi7Tile

json_dict = json.loads('''${JSON.stringify(data, null, '\t')}''')
e7tile = Equi7Tile(**json_dict)
    `
  navigator.clipboard.writeText(code_template);
  Swal.fire({
    position: "top-end",
    icon: "success",
    title: '<span style="font-size: 18px;font-weight: bold;">Copied Equi7Tile generation code.</span>',
    showConfirmButton: false,
    timer: 1500,
    width: "400px"
  });
}

// setup dataset loader animation
function startLoader(){
  toggle3dIcon.innerHTML = `<span class="loader" id="loader"></span>`;
  toggle3dIcon.disabled = true;
}

function endLoader(){
  toggle3dIcon.innerHTML = '\uD83C\uDF0D';
  toggle3dIcon.disabled = false;
}

// setup coordinate reprojection
document.getElementById('reproject-coord').onclick = async () => {
  if(toEqui7){
    const x = document.getElementById('x-coord-other').value;
    const y = document.getElementById('y-coord-other').value;
    const otherEpsg = document.getElementById('other-crs').value;

    if (!x || !y || !otherEpsg) return;

    const res = await fetch(
        `/reprojectToEqui7?x=${x}&y=${y}&epsg=${otherEpsg}`
    );
    const data = await res.json();

    document.getElementById('x-coord-e7').value = data.x.toFixed(3);
    document.getElementById('y-coord-e7').value = data.y.toFixed(3);
    document.getElementById('proj-continent-selection').value = epsgMap[data.epsg];
  }
  else{
    const x = document.getElementById('x-coord-e7').value;
    const y = document.getElementById('y-coord-e7').value;
    const continent = document.getElementById('proj-continent-selection').value;
    const otherEpsg = document.getElementById('other-crs').value;

    if (!x || !y || !continent) return;

    const res = await fetch(
        `/reprojectFromEqui7?x=${x}&y=${y}&continent=${continent}&epsg=${otherEpsg}`
    );
    const data = await res.json();

    document.getElementById('x-coord-other').value = data.x.toFixed(3);
    document.getElementById('y-coord-other').value = data.y.toFixed(3);
  }
};

const projSwitchIcon = document.getElementById('proj-switch-icon');
projSwitchIcon.onclick = () => {
  if(toEqui7){
    projSwitchIcon.innerText = "\u2B06\uFE0F";
    toEqui7 = false;
    document.getElementById('x-coord-other').value = "";
    document.getElementById('y-coord-other').value = "";
    if(!reprojMouse){
      document.getElementById('other-crs').value = "";
    }
    document.getElementById('proj-continent-selection').disabled = false;
  }
  else{
    projSwitchIcon.innerText = "\u2B07\uFE0F";
    toEqui7 = true;
    document.getElementById('x-coord-e7').value = "";
    document.getElementById('y-coord-e7').value = "";
    document.getElementById('proj-continent-selection').disabled = true;
  }
}

function setReprojMouse(flag){
  reprojMouse = flag;
  const otherCRS = document.getElementById('other-crs');
  if (reprojMouse){
    otherCRS.disabled = true
  }
  else{
    otherCRS.disabled = false
  }
}

// app panel management
const appPanel = document.getElementById('settings-app');
const appIcon = document.getElementById('settings-app-icon');
const minimizeBtn = document.getElementById('minimize-settings-app');

const projAppPanel = document.getElementById('proj-app');
const projAppIcon = document.getElementById('proj-app-icon');
const projMinimizeBtn = document.getElementById('minimize-proj-app');

const layerAppPanel = document.getElementById('layer-app');
const layerAppIcon = document.getElementById('layer-app-icon');
const layerMinimizeBtn = document.getElementById('minimize-layer-app');

const tileAppPanel = document.getElementById('tile-app');
const tileAppIcon = document.getElementById('tile-app-icon');
const tileMinimizeBtn = document.getElementById('minimize-tile-app');

const tilingAppPanel = document.getElementById('tiling-app');
const tilingAppIcon = document.getElementById('tiling-app-icon');
const tilingMinimizeBtn = document.getElementById('minimize-tiling-app');

const app_panels = {"app": appPanel, "proj": projAppPanel, "layer": layerAppPanel, "tile": tileAppPanel, "tiling": tilingAppPanel}
const app_icons = {"app": appIcon, "proj": projAppIcon, "layer": layerAppIcon, "tile": tileAppIcon, "3d": toggle3dIcon, "tiling": tilingAppIcon}

function minimize_app(){
  Object.values(app_panels).forEach(panel => {
    panel.classList.remove('visible');
    panel.classList.add('closed');
  });
  Object.values(app_icons).forEach(icon => {
    icon.style.display = 'block';
  });
}

function open_app(name){
  Object.keys(app_panels).forEach(key => {
    panel = app_panels[key]
    if (name == key){
      panel.classList.remove('closed');
      panel.classList.add('visible');
    }
  });
  Object.values(app_icons).forEach(icon => {
    icon.style.display = 'none';
  });
}

minimizeBtn.onclick = () => {
    minimize_app()
    setTimeout(() => map.updateSize(), 50);
};

appIcon.onclick = () => {
    open_app("app")
    setTimeout(() => map.updateSize(), 50);
};

projMinimizeBtn.onclick = () => {
    minimize_app()
    setTimeout(() => map.updateSize(), 50);
};

projAppIcon.onclick = () => {
    open_app("proj")
    setTimeout(() => map.updateSize(), 50);
};

layerMinimizeBtn.onclick = () => {
    minimize_app()
    setTimeout(() => map.updateSize(), 50);
};

layerAppIcon.onclick = () => {
    open_app("layer")
    setTimeout(() => map.updateSize(), 50);
};

tileMinimizeBtn.onclick = () => {
    minimize_app()
    setTimeout(() => map.updateSize(), 50);
};

tileAppIcon.onclick = () => {
    open_app("tile")
    setTimeout(() => map.updateSize(), 50);
};

tilingMinimizeBtn.onclick = () => {
    minimize_app()
    setTimeout(() => map.updateSize(), 50);
};

tilingAppIcon.onclick = () => {
    open_app("tiling")
    setTimeout(() => map.updateSize(), 50);
};

// tiling layer management
const addTilingAF = document.getElementById("add-tiling-af");
const delTilingAF = document.getElementById("del-tiling-af");
const selectAFTiling = document.getElementById("select-tiling-af");
addTilingAF.onclick = async () => {
  startLoader();
  await doAddDel("AF", selectAFTiling.value, false);
  endLoader();
}
delTilingAF.onclick = async () => {
  await doAddDel("AF", selectAFTiling.value, true);
}

const addTilingAN = document.getElementById("add-tiling-an");
const delTilingAN = document.getElementById("del-tiling-an");
const selectANTiling = document.getElementById("select-tiling-an");
addTilingAN.onclick = async () => {
  startLoader();
  await doAddDel("AN", selectANTiling.value, false);
  endLoader();
}
delTilingAN.onclick = async () => {
  await doAddDel("AN", selectANTiling.value, true);
}

const addTilingAS = document.getElementById("add-tiling-as");
const delTilingAS = document.getElementById("del-tiling-as");
const selectASTiling = document.getElementById("select-tiling-as");
addTilingAS.onclick = async () => {
  startLoader();
  await doAddDel("AS", selectASTiling.value, false);
  endLoader();
}
delTilingAS.onclick = async () => {
  await doAddDel("AS", selectASTiling.value, true);
}

const addTilingEU = document.getElementById("add-tiling-eu");
const delTilingEU = document.getElementById("del-tiling-eu");
const selectEUTiling = document.getElementById("select-tiling-eu");
addTilingEU.onclick = async () => {
  startLoader();
  await doAddDel("EU", selectEUTiling.value, false);
  endLoader();
}
delTilingEU.onclick = async () => {
  await doAddDel("EU", selectEUTiling.value, true);
}

const addTilingNA = document.getElementById("add-tiling-na");
const delTilingNA = document.getElementById("del-tiling-na");
const selectNATiling = document.getElementById("select-tiling-na");
addTilingNA.onclick = async () => {
  startLoader();
  await doAddDel("NA", selectNATiling.value, false);
  endLoader();
}
delTilingNA.onclick = async () => {
  await doAddDel("NA", selectNATiling.value, true);
}

const addTilingOC = document.getElementById("add-tiling-oc");
const delTilingOC = document.getElementById("del-tiling-oc");
const selectOCTiling = document.getElementById("select-tiling-oc");
addTilingOC.onclick = async () => {
  startLoader();
  await doAddDel("OC", selectOCTiling.value, false);
  endLoader();
}
delTilingOC.onclick = async () => {
  await doAddDel("OC", selectOCTiling.value, true);
}

const addTilingSA = document.getElementById("add-tiling-sa");
const delTilingSA = document.getElementById("del-tiling-sa");
const selectSATiling = document.getElementById("select-tiling-sa");
addTilingSA.onclick = async () => {
  startLoader();
  await doAddDel("SA", selectSATiling.value, false);
  endLoader();
}
delTilingSA.onclick = async () => {
  await doAddDel("SA", selectSATiling.value, true);
}

// bounding box coordinate form activation
const bboxBtn = document.getElementById('bbox-button');
const bboxWrapper = document.getElementById('bbox-container');
bboxBtn.onclick = () => {
    tileQueryOp = "BBOX";
    if(bboxWrapper.style.display == "grid"){
      bboxWrapper.style.display = "none";
    }
    else{
      bboxWrapper.style.display = "grid";
    }
    
};

// collapse tiling layers
function collapse(continent){
  const plusText = "\u2795";
  const minusText = "\u2796";
  const liTiling = document.getElementById(continent);
  liTiling.classList.toggle('collapsed');
  const innerText = liTiling.children[0].children[0].innerText
  if (innerText == plusText){
     liTiling.children[0].children[0].innerText = minusText;
  }
  else {
    liTiling.children[0].children[0].innerText = plusText;
  }
 
}

// setup layer manager
function renderLayerSwitcher() {
  const dsIds = Object.keys(layerRegistry)
  const tilingIdsContMap = {}
  for(const continent of continents){
    tilingIdsContMap[continent] = []
  }

  for(const dsId of dsIds){
    const continent = dsId.split("_")[0]
    const tilingId = dsId.split("_")[1]
    tilingIdsContMap[continent].push(tilingId)
  }

  for(const continent of continents){
    tilingIdsContMap[continent].sort()
  }

  for(const continent of Object.keys(tilingIdsContMap)){
    const continentLi = document.getElementById(continent.toLowerCase());
    const continentId = continent + "Ul";
    let tilingList = document.getElementById(continentId);
    if(tilingList == null){
      tilingList = document.createElement('ul');
    } 
    tilingList.innerHTML = "";
    tilingList.id = continentId;
    tilingList.className = "tiling-list";
    for(const tilingId of tilingIdsContMap[continent]){
      const dsId = continent + "_" + tilingId
      const li = document.createElement('li');
      li.className = 'tiling-item';
      li.draggable = true;
      li.dataset.layerId = dsId;

      if(tilingId == "ZONE"){
        li.innerHTML = `<input type="checkbox"></input> ${tilingId}`
      }
      else{
        li.innerHTML = `
      <input type="checkbox"></input>
      ${tilingId}
      <span style="float: right; margin-right: 10px;">
      Fill:
      <input id="FillColor_${dsId}" type="color" oninput="updateFillColor('${dsId}', this.value);"></input>
      Stroke:
      <input id="StrokeColor_${dsId}" type="color" oninput="updateStrokeColor('${dsId}', this.value);"></input>
      </span>
      `;
      }
      

      li.querySelector('input').onchange = e => {
        setLayerVisible(dsId, e.target.checked);
      };
      tilingList.appendChild(li);
      
    }
    enableDragAndDrop(tilingList, '.tiling-item');
    continentLi.appendChild(tilingList);
  }
  const continentList = document.getElementById('continent-list');
  enableDragAndDropOuter(continentList, '.continent-item', '.tiling-item');

  const tilesTilingSelect = document.getElementById("tiles-tiling")
  tilesTilingSelect.innerHTML = "";
  for (const tilingId of tilingIds){
    if(tilingId == "ZONE"){
      continue
    }
    const opt = document.createElement("option");
    opt.value = tilingId;
    opt.innerText = tilingId;
    tilesTilingSelect.appendChild(opt)
  }
}

function enableDragAndDrop(list, itemName) {
  let draggedItem = null;

  list.querySelectorAll(itemName).forEach(item => {
    item.addEventListener('dragstart', () => {
      draggedItem = item;
      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      draggedItem = null;
      item.classList.remove('dragging');
      applyLayerOrder(itemName);
    });

    item.addEventListener('dragover', e => {
      e.preventDefault();
      if(draggedItem != null){
        const after = getDragAfterElement(list, e.clientY, itemName);
        if (after == null) {
          list.appendChild(draggedItem);
        } else {
          list.insertBefore(draggedItem, after);
        }
      }
    });
  });
}

function enableDragAndDropOuter(list, itemNameOuter, itemNameInner) {
  let draggedItem = null;

  list.querySelectorAll(itemNameOuter).forEach(item => {
    item.addEventListener('dragstart', () => {
      draggedItem = item;
      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      draggedItem = null;
      item.classList.remove('dragging');
      applyLayerOrder(itemNameInner);
    });

    item.addEventListener('dragover', e => {
      e.preventDefault();
      const after = getDragAfterElement(list, e.clientY, itemNameOuter);
      if (after == null) {
        list.appendChild(draggedItem);
      } else {
        list.insertBefore(draggedItem, after);
      }
    });
  });
}

function getDragAfterElement(container, y, itemName) {
  const elements = [...container.querySelectorAll(itemName + ':not(.dragging)')];

  return elements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;

    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// launch the application
create2d();
init3d();
initLayers();
