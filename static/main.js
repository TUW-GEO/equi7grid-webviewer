
//proj4.defs("EPSG:27704","+proj=aeqd +lat_0=53 +lon_0=24 +x_0=5837287.82 +y_0=2121415.696 +datum=WGS84 +units=m +no_defs +type=crs");
//ol.proj.proj4.register(proj4);
const browser = bowser.getParser(window.navigator.userAgent);
console.log(`The current browser name is "${browser.getBrowserName()}"`)

const disable3D = browser.getBrowserName() != "Chrome";
let is3D = false;
let reprojMouse = false;
let toEqui7 = true;
let queryData = null;
let csHlPrimitive = null;
let activeGrid = null;
let tileQueryOp = null;
let drawInteraction;
let lastPointerCoord = null;

let ol3d;
let scene;
let handler;
let camera;

const layerRegistry = {}
const styleRegistry = {}
const layerDeleteRegistry = {"AF": false, "AN": false, "AS": false, "EU": false, "NA": false, "OC": false, "SA": false}
const fontFamily = "Segoe UI, Tahoma, Geneva, Verdana, sans-serif";

const hlFillColor = [223, 216, 17, 0.9]
const hlStrokeColor = [255, 138, 5, 1.0]
const continents = ["AF", "AN", "AS", "EU", "OC", "NA", "SA"]
const tiling_levels = ["T6", "T3", "T1", "ZONE"]//, "T1"]
const initTilingIds = ["T6"]
const epsg_map = {27701: "AF", 27702: "AN", 27703:  "AS", 27704:  "EU", 
  27705:  "NA", 27706:  "OC", 27707:  "SA"}

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

/*
function changeProjection(epsgCode) {
    const oldView = map.getView();
    const oldProjection = oldView.getProjection();

    if (!oldProjection) {
        console.error("Old projection is null");
        return;
    }

    const newProjection = ol.proj.get(epsgCode);

    if (!newProjection) {
        console.error("Unknown projection:", epsgCode);
        return;
    }

    const oldCenter = oldView.getCenter();
    const newCenter = ol.proj.transform(
        oldCenter,
        oldProjection,
        newProjection
    );

    const newView = new ol.View({
        projection: newProjection,
        center: newCenter,
        zoom: oldView.getZoom()
    });

    map.setView(newView);

    // Refresh vector data
    vectorLayer.getSource().clear();
    vectorLayer.getSource().refresh();
}
    */


const openfreemap = new ol.layer.Group()

const osmLayer = new ol.layer.Tile({
    source: new ol.source.OSM()
});

let view = new ol.View({
    center: ol.proj.fromLonLat([11, 51]),
    zoom: 5
});

/*
const vectorLayer = new ol.layer.Vector({
    source: new ol.source.Vector({
        url: '/grid',
        format: new ol.format.GeoJSON()
    })
});
*/

const olVectorStyle = new ol.style.Style({
  fill: new ol.style.Fill({
    color: 'rgba(0,0,255,0.4)'
  }),
  stroke: new ol.style.Stroke({
    color: 'rgba(0,0,0,1)',
    width: 2
  })
});

const drawSource = new ol.source.Vector();

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

//vectorLayer.setStyle(olVectorStyle);


const map = new ol.Map({
    target: 'map',
    layers: [osmLayer],
    view: view
    /*renderer: 'canvas'*/
});

map.addLayer(drawLayer);

function drawPolygon() {
  if (drawInteraction) {
    map.removeInteraction(drawInteraction);
  }

  drawInteraction = new ol.interaction.Draw({
    source: drawSource,
    type: 'Polygon'
  });

  map.addInteraction(drawInteraction);
}

function drawBoundingBox() {
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

function clearDrawings() {
  drawSource.clear();
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && drawInteraction) {
    drawInteraction.abortDrawing();
  }
});

/*
const map = new ol.Map({
  layers: [openfreemap],
    view: new ol.View({ center: ol.proj.fromLonLat([13.388, 52.517]), zoom: 9.5 }),
    target: 'map',
})
olms.apply(openfreemap, 'https://tiles.openfreemap.org/styles/positron')
*/
async function create3d(){
  if (!disable3D){
  ol3d = new olcs.OLCesium({ map, 
    synchronize: false   // IMPORTANT: disable layer sync
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

  //Object.keys(styleRegistry).forEach(ds_id => updateStyle(ds_id));

    const picked = scene.pick(movement.position);
    if (!picked || !picked.id) return;

    const ds_id = ds_id_from_name(picked.id);
    const feature = layerRegistry[ds_id]["ol"].getSource().getFeatures().find(f => f.get('name') === picked.id);
    if(feature){
      const coordinates = [];
      for (const coord of feature.getGeometry().getCoordinates()[0]){
        const lonlat = ol.proj.toLonLat(coord);
        coordinates.push(lonlat);
      }
      
      const csGeom = new Cesium.GeometryInstance({
          geometry: polygonFromGeoJSON(coordinates.flat()),
          id: picked.id
        })

      const csHlFillColor = new Cesium.Color(hlFillColor[0]/255., hlFillColor[1]/255., hlFillColor[2]/255., hlFillColor[3]);
      const material = new Cesium.Material({
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
            material: material
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
      
      const cntrCoord = cartesianToOlCoordinate(center);
      overlay.setPosition(cntrCoord);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

document.getElementById('zoom-in').onclick = () => {
    camera.zoomIn(camera.positionCartographic.height * 0.2);
  };

document.getElementById('zoom-out').onclick = () => {
    camera.zoomOut(camera.positionCartographic.height * 0.2);
  };
} 
}



/*
function addFeatureToCesium(feature) {
  const geom = feature.getGeometry();
  const type = geom.getType();

  const props = feature.getProperties();

  if (type === 'Polygon') {
    const coords = geom.getCoordinates()[0].flatMap(c =>
      ol.proj.toLonLat(c)
    );

    cesiumDataSource.entities.add({
      id: feature.getId(),
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(coords),
        material: Cesium.Color.BLUE.withAlpha(0.4)
      },
      properties: props
    });
  }
}
  */

let cesiumGeoJsonSource = null;

async function createCesiumSource(id, url, style) {
  let url_is_zone = !url.includes("tiling_id")

  const ds = await Cesium.GeoJsonDataSource.load(url, {
    clampToGround: !url_is_zone,
  });

  const now = Cesium.JulianDate.now();

  rgb = hexToRgb(style.fillColor);
  rgba = [rgb.r, rgb.g, rgb.b, style.alpha];
  const csFillColor = new Cesium.Color(rgba[0]/255., rgba[1]/255., rgba[2]/255., rgba[3]);

  rgb = hexToRgb(style.strokeColor);
  rgba = [rgb.r, rgb.g, rgb.b, style.alpha];
  const csStrokeColor = new Cesium.Color(rgba[0]/255., rgba[1]/255., rgba[2]/255., rgba[3]);

  ds.entities.values.forEach(entity => {
    if (!entity.polygon) return;

    // Fill
    entity.polygon.material = csFillColor;
    if (url_is_zone){
      entity.polygon.outline = true;
      entity.polygon.outlineColor = csStrokeColor;
    }
    else {
      entity.polygon.classificationType =
      Cesium.ClassificationType.TERRAIN;
    }

    // 🔥 OUTLINE AS POLYLINE (correct)
    const hierarchy =
      entity.polygon.hierarchy.getValue(now);

    if (!hierarchy) return;

    if(!url_is_zone){
    ds.entities.add({
      polyline: {
        positions: hierarchy.positions,
        width: style.strokeWidth,
        material: csStrokeColor,
        clampToGround: true,
      }
    });
    }
    
    const name = entity.properties.name?.getValue();
    if (!name) return;

    entity.tilename = name;

    const center =
      Cesium.BoundingSphere.fromPoints(
        hierarchy.positions
      ).center;

    // 🔤 ADD LABEL
    entity.label = new Cesium.LabelGraphics({
      text: name,
      font: '14px ' + fontFamily,
      fillColor: Cesium.Color.BLACK,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER
      //distanceDisplayCondition:
      //  new Cesium.DistanceDisplayCondition(0, 100_000_000)
    });

    entity.position = center;
    entity.label.show = false;

  });

  return ds;
}

function polygonFromGeoJSON(coords) {
  return Cesium.PolygonGeometry.fromPositions({
    positions: Cesium.Cartesian3.fromDegreesArray(coords.flat()),
    vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT
  });
}

function createPolygonLayer(geojson, style) {
  const instances = [];

  for(const f of geojson.features){
    const positions = f.geometry.coordinates[0].flat()

    instances.push(
      new Cesium.GeometryInstance({
        geometry: polygonFromGeoJSON(positions),
        id: f.properties.name
      })
    );
  };

  rgb = hexToRgb(style.fillColor);
  rgba = [rgb.r, rgb.g, rgb.b, style.alpha];
  const csFillColor = new Cesium.Color(rgba[0]/255., rgba[1]/255., rgba[2]/255., rgba[3]);

  const material = new Cesium.Material({
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
        material: material
      })
    /*
    appearance: new Cesium.PerInstanceColorAppearance({
      translucent: true,
      closed: true
    }),
    */
  });
}

function createOutlines(geojson, style) {
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

  const material = new Cesium.Material({
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
        material: material
      })
  });
}


function createLabels(geojson, style) {
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


async function createCesiumSourceNew(id, url, style) {
  if(disable3D){return;};
  let url_is_zone = !url.includes("tiling_id")
  const geojson = await fetch(url).then(r => r.json());
  const polyPrimitive = createPolygonLayer(geojson, style);
  const outlinePrimitive = createOutlines(geojson, style);
  const labelPrimitive = createLabels(geojson, style);
  labelPrimitive.show = false;
  
  return [polyPrimitive, outlinePrimitive, labelPrimitive]
}
  /*
  const ds = await Cesium.GeoJsonDataSource.load(url, {
    clampToGround: !url_is_zone,
  });

  const now = Cesium.JulianDate.now();

  rgb = hexToRgb(style.fillColor);
  rgba = [rgb.r, rgb.g, rgb.b, style.alpha];
  const csFillColor = new Cesium.Color(rgba[0]/255., rgba[1]/255., rgba[2]/255., rgba[3]);

  rgb = hexToRgb(style.strokeColor);
  rgba = [rgb.r, rgb.g, rgb.b, style.alpha];
  const csStrokeColor = new Cesium.Color(rgba[0]/255., rgba[1]/255., rgba[2]/255., rgba[3]);

  ds.entities.values.forEach(entity => {
    if (!entity.polygon) return;

    // Fill
    entity.polygon.material = csFillColor;
    if (url_is_zone){
      entity.polygon.outline = true;
      entity.polygon.outlineColor = csStrokeColor;
    }
    else {
      entity.polygon.classificationType =
      Cesium.ClassificationType.TERRAIN;
    }

    // 🔥 OUTLINE AS POLYLINE (correct)
    const hierarchy =
      entity.polygon.hierarchy.getValue(now);

    if (!hierarchy) return;

    if(!url_is_zone){
    ds.entities.add({
      polyline: {
        positions: hierarchy.positions,
        width: style.strokeWidth,
        material: csStrokeColor,
        clampToGround: true,
      }
    });
    }
    
    const name = entity.properties.name?.getValue();
    if (!name) return;

    entity.tilename = name;

    const center =
      Cesium.BoundingSphere.fromPoints(
        hierarchy.positions
      ).center;

    // 🔤 ADD LABEL
    entity.label = new Cesium.LabelGraphics({
      text: name,
      font: '14px ' + fontFamily,
      fillColor: Cesium.Color.BLACK,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER
      //distanceDisplayCondition:
      //  new Cesium.DistanceDisplayCondition(0, 100_000_000)
    });

    entity.position = center;
    entity.label.show = false;

  });

  return ds;
}

/*
async function loadGridCesium({ continent, sampling, tiling_id }) {
  const url =
    `/grid?continent=${continent}&sampling=${sampling}&tiling_id=${tiling_id}`;

  const dataSources = ol3d.getDataSources();

  // Remove previous datasource
  if (cesiumGeoJsonSource) {
    dataSources.remove(cesiumGeoJsonSource);
    cesiumGeoJsonSource = null;
  }

  // Load GeoJSON directly into Cesium
  cesiumGeoJsonSource = await Cesium.GeoJsonDataSource.load(url, {
    clampToGround: true
  });

  // Styling
  // Apply style + outline
  const now = Cesium.JulianDate.now();

  cesiumGeoJsonSource.entities.values.forEach(entity => {
    if (!entity.polygon) return;

    // Fill
    entity.polygon.material =
      Cesium.Color.BLUE.withAlpha(0.4);

    entity.polygon.classificationType =
      Cesium.ClassificationType.TERRAIN;

    entity.polygon.outlineColor = Cesium.Color.GREEN
    //entity.polygon

    // 🔥 OUTLINE AS POLYLINE (correct)
    const hierarchy =
      entity.polygon.hierarchy.getValue(now);

    if (!hierarchy) return;

    cesiumGeoJsonSource.entities.add({
      polyline: {
        positions: hierarchy.positions,
        width: 2,
        material: Cesium.Color.BLACK,
        clampToGround: true
      }
    });
  });

  dataSources.add(cesiumGeoJsonSource);
  // Optional zoom
  await ol3d.getCesiumScene().camera.flyTo({
    destination: Cesium.BoundingSphere.fromPoints(
      cesiumGeoJsonSource.entities.values
        .filter(e => e.position)
        .map(e => e.position.getValue(Cesium.JulianDate.now()))
    ).center
  });
}

ol3d.getOLMap().getLayers().forEach(layer => {
  if (layer instanceof ol.layer.Vector) {
    layer.setVisible(!is3D);
  }
});

const source = vectorLayer.getSource();

source.on('featuresloadstart', () => {
  cesiumDataSource.entities.removeAll();
});

source.on('featuresloadend', () => {
  if (!ol3d.getEnabled()) return;

  source.getFeatures().forEach(addFeatureToCesium);
});
*/

/*
const source = vectorLayer.getSource();

// Initial load
source.getFeatures().forEach(addFeatureToCesium);

// Add / update
source.on('addfeature', e => addFeatureToCesium(e.feature));

// Remove
source.on('removefeature', e => {
  cesiumDataSource.entities.removeById(e.feature.getId());
});

// Update geometry
source.on('changefeature', e => {
  cesiumDataSource.entities.removeById(e.feature.getId());
  addFeatureToCesium(e.feature);
});
*/

//const scene = ol3d.getCesiumScene();

//const cesiumDataSource = new Cesium.CustomDataSource('dynamic-vectors');
//ol3d.getDataSources().add(cesiumDataSource);


/*
document.getElementById('toggle-3d-icon').onclick = () => {
  //ol3d.setEnabled(is3D);
  is3D = !is3D;
  ol3d.setEnabled(is3D);

  document.getElementById('toggle-3d-icon').innerText = is3D ? '\uD83D\uDDFA\uFE0F' : '\uD83C\uDF0D';

  map.getInteractions().forEach(i => i.setActive(!is3D));

  if (!is3D){
    source.getFeatures().forEach(feature => {
    //source.removeFeature(feature);
    cesiumDataSource.entities.removeById(feature.getId())
    });
  }
  else {
    source.getFeatures().forEach(feature => {
    //source.removeFeature(feature);
    addFeatureToCesium(feature);
    });
  }
};
*/

function getRandomColor() {
  var letters = '0123456789ABCDEF';
  var color = '#';
  for (var i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

function set3D(enabled) {
  is3D = enabled;
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

  // Disable OL interactions
  map.getInteractions().forEach(i =>
    i.setActive(!enabled)
  );

  if(enabled){
    requestAnimationFrame(() => {
      requestAnimationFrame(moveCesiumCredits);
    });
  }
}

const zoomIn3D = document.getElementById('zoom-in');
const zoomOut3D = document.getElementById('zoom-out');

document.getElementById('toggle-3d-icon').onclick = () => {
  if (!disable3D){
    set3D(!is3D);
    document.getElementById('toggle-3d-icon').innerText = is3D ? '\uD83D\uDDFA\uFE0F' : '\uD83C\uDF0D';

    if(is3D){
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

function updateStyles(){
  Object.keys(styleRegistry).forEach(ds_id => updateStyle(ds_id));
}


const popup = document.getElementById('popup');
const overlay = new ol.Overlay({
    element: popup
});
map.addOverlay(overlay);

map.on('click', function (evt) {
    if(!disable3D){
      if (ol3d.getEnabled()) return;
    }
    if (drawInteraction) return;
    
    map.forEachFeatureAtPixel(evt.pixel, function (feature) {
        const props = feature.getProperties();
        popup.innerHTML = props.name;
        overlay.setPosition(evt.coordinate);
    });
});

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
        document.getElementById('xCoordOther').value = lonlat[0].toFixed(6);
        document.getElementById('yCoordOther').value = lonlat[1].toFixed(6);
        document.getElementById('otherCRS').value = 4326;
        document.getElementById('xCoordE7').value = "";
        document.getElementById('yCoordE7').value = "";
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

function ds_id_from_name(name){
  let ds_id = null; 
  if(name.includes("_")){
    ds_id = name.substring(0, 2) + "_" + name.substring(name.length - 2, name.length)
  }
  else{
    ds_id = name + "_ZONE";
  }

  return ds_id
}

function selectStyle(feature) {
  if(!tileQueryOp){
    ds_id = ds_id_from_name(feature.getProperties().name)
    const selectedStyle = createLabelStyle(feature, styleRegistry[ds_id])
    selectedStyle.getFill().setColor(hlFillColor);
    return selectedStyle;
  }
}

const selectClick = new ol.interaction.Select({
  condition: ol.events.click,
  style: selectStyle
});
map.addInteraction(selectClick);


map.on('pointermove', e => {
    lastPointerCoord = e.coordinate;
    const coord = ol.proj.toLonLat(e.coordinate);
    document.getElementById('coords').innerHTML =
        `<b>Lon:</b> ${coord[0].toFixed(4)}, <b>Lat:</b> ${coord[1].toFixed(4)}`;
});


const strokeSlider = document.getElementById('strokeWidthSlider');
const strokeEmoji =document.getElementById('strokeEmoji');

function updateStrokeEmoji() {
  const min = strokeSlider.min;
  const max = strokeSlider.max;
  const percent = (strokeSlider.value - min) / (max - min);
  strokeEmoji.style.left = percent * 100 + '%';
}

strokeSlider.addEventListener('input', updateStrokeEmoji);
updateStrokeEmoji();


const opacSlider = document.getElementById('opacSlider');
const opacEmoji =document.getElementById('opacEmoji');

function updateOpacEmoji() {
  const min = opacSlider.min;
  const max = opacSlider.max;
  const percent = (opacSlider.value - min) / (max - min);
  opacEmoji.style.left = percent * 100 + '%';
}

opacSlider.addEventListener('input', updateOpacEmoji);
updateOpacEmoji();

/*
document.getElementById('loadGrid').onclick = () => {
    ol3d.setEnabled(false);
    map.removeLayer(vectorLayer);
    const continent = document.getElementById('continent').value;
    const sampling = document.getElementById('sampling').value;
    const tiling_id = document.getElementById('tiling_id').value;
    if (!continent) return;
    map.addLayer(vectorLayer);
      const source = vectorLayer.getSource()
      //source.getFeatures().forEach(feature => {
      //cesiumDataSource.entities.removeById(feature.getId())
    //});
      console.log("test")
      source.setUrl(`/grid?continent=${continent}&sampling=${sampling}&tiling_id=${tiling_id}`);
      source.refresh();
      //source.getFeatures().forEach(addFeatureToCesium);
      if (is3D){
      ol3d.setEnabled(true);
      }
    };
*/

function highlightSingleTile(tile){
    if(queryData){
      queryData.forEach(t => {
        const tileItem = document.getElementById(t);
        tileItem.classList.add("tile-item");
        tileItem.classList.remove("tile-item-active");
      });
    }

    Object.keys(styleRegistry).forEach(ds_id => updateStyle(ds_id));

    if(csHlPrimitive){
      scene.primitives.remove(csHlPrimitive);
      csHlPrimitive.destroy();
    }

    const csGeom = highlightTile(tile);

    const csHlFillColor = new Cesium.Color(hlFillColor[0]/255., hlFillColor[1]/255., hlFillColor[2]/255., hlFillColor[3]);
      const material = new Cesium.Material({
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
            material: material
          })
      })
      csHlPrimitive.show = true;

    scene.primitives.add(csHlPrimitive);
}

function highlightTile(tile){
    const tileItem = document.getElementById(tile);
    tileItem.classList.remove("tile-item");
    tileItem.classList.add("tile-item-active");

    ds_id = ds_id_from_name(tile);
    const feature = layerRegistry[ds_id]["ol"].getSource().getFeatures().find(f => f.get('name') === tile);
    if(feature){
      const selectedStyle = createLabelStyle(feature, styleRegistry[ds_id])
      selectedStyle.getFill().setColor(hlFillColor);
      feature.setStyle(selectedStyle);

      const coordinates = [];
      for (const coord of feature.getGeometry().getCoordinates()[0]){
        const lonlat = ol.proj.toLonLat(coord);
        coordinates.push(lonlat);
      }
      
      const csGeom = new Cesium.GeometryInstance({
          geometry: polygonFromGeoJSON(coordinates.flat()),
          id: tile
        })

      return csGeom;
    }

    
}

document.getElementById('copy-tilenames-icon').onclick = () => {
  const tileList = document.getElementById('tileList');
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

document.getElementById('copy-traffos-icon').onclick = async () => {
  const tileList = document.getElementById('tileList');
  const traffos = {};
  for (const tileItem of tileList.childNodes){
      const tilename = tileItem.id;
      const res = await fetch(
        `/traffo?tilename=${tilename}`
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

document.getElementById('copy-e7tiles-icon').onclick = async () => {
  const tileList = document.getElementById('tileList');
  const e7tiles = {};
  for (const tileItem of tileList.childNodes){
      const tilename = tileItem.id;
      const res = await fetch(
        `/e7tile?tilename=${tilename}`
      );
      const data = await res.json();
      e7tiles[tilename] = data;
  }
  const code_template = ` 
import json
from equi7grid._core import Equi7Tile

json_dict = json.loads('''${JSON.stringify(e7tiles, null, '\t')}''')
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

async function copyTraffo(tile){
  const res = await fetch(
        `/traffo?tilename=${tile}`
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

async function copyPython(tile){
  const res = await fetch(
        `/e7tile?tilename=${tile}`
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

document.getElementById('queryTiles').onclick = async () => {
    updateStyles();
    if(!tileQueryOp){
        const bboxWrapper = document.getElementById('bboxWrapper');
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

    const tiling_id = document.getElementById("tilesTiling").value;
    let res;
    if(tileQueryOp == "BBOX"){
      const east = document.getElementById('bbox_e').value
      const south = document.getElementById('bbox_s').value
      const west = document.getElementById('bbox_w').value
      const north = document.getElementById('bbox_n').value
      res = await fetch(
        `/tilesFromBbox?east=${east}&south=${south}&west=${west}&north=${north}&tiling_id=${tiling_id}`
    );
    }
    else{
      const feature = drawSource.getFeatures()[0];
      const wkt = new ol.format.WKT();
      const wktGeom = wkt.writeGeometry(feature.getGeometry());
      res = await fetch(
        `/tilesFromWkt?wkt=${wktGeom}&tiling_id=${tiling_id}`
    );
    }
    
    //const sampling = document.getElementById('sampling').value;
    //const tiling_id = activeGrid.split("_")[1];

    
    const data = await res.json();

    const list = document.getElementById('tileList');
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
      const material = new Cesium.Material({
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
            material: material
          })
      })
      csHlPrimitive.show = true;

    scene.primitives.add(csHlPrimitive);

    queryData = data;

    clearDrawings();
    tileQueryOp = null;

    //document.getElementById('tileResults').innerText = `${data}`;
    };

function createLabelStyle(feature, style) {
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


function applyCesiumLabels(csPrimitives, activate) {
  if (!csPrimitives) return;
  csPrimitives[2].show = activate;
}


function createOlVectorLayer(url, style) {
  const source = new ol.source.Vector({
      url,
      format: new ol.format.GeoJSON()
    })

  const vl = new ol.layer.Vector({
    source: source,
    visible: false
  });

  vl.setStyle(feature => createLabelStyle(feature, style));

  source.loadFeatures(
    map.getView().calculateExtent(map.getSize()),
    map.getView().getResolution(),
    map.getView().getProjection()
  );

  return vl
}

async function registerDataset(id, url) {
  const olURL = url + "&env=ol"
  if (!(id in styleRegistry)){
    styleRegistry[id] = defaultStyle
  }
  const style = styleRegistry[id];
  // 2D
  const olLayer = createOlVectorLayer(olURL, style);
  map.addLayer(olLayer);

  const olSource = olLayer.getSource();
  await new Promise(resolve => {
    if (olSource.getState() === 'ready') {
      resolve();
    } else {
      olSource.once('featuresloadend', resolve);
    }
  });

  // 3D
  const csURL = url + "&env=cs"
  const csPrimitives = await createCesiumSourceNew(id, csURL, style);
  if(!(disable3D)){
    scene.primitives.add(csPrimitives[0]);
    scene.primitives.add(csPrimitives[1]);
    scene.primitives.add(csPrimitives[2]);
  }
  
  //scene.globe.depthTestAgainstTerrain = false;

  layerRegistry[id] = {
    ol: olLayer,
    cesium: csPrimitives,
    visible: false
  };
}

function setLayerVisible(id, visible) {
  const layer = layerRegistry[id];
  if (!layer) return;

  layer.visible = visible;

  // 2D
  if (layer.ol) {
    if(!disable3D){
      layer.ol.setVisible(!ol3d.getEnabled() && visible);
    }else{
      layer.ol.setVisible(visible);
    }
  }

  // 3D
  if (layer.cesium) {
    layer.cesium[0].show = ol3d.getEnabled() && visible;
    layer.cesium[1].show = ol3d.getEnabled() && visible;
  }
}

async function init_zones(){
  for (const continent of continents){
    const ds_id = continent + "_ZONE"
    let zoneStyle = {};
    zoneStyle = {...defaultStyle};
    zoneStyle.fillColor = zoneColours[continent];
    styleRegistry[ds_id] = zoneStyle;
    await registerDataset(ds_id, `/grid?continent=${continent}`);
  }
  renderLayerSwitcher();
}

function startLoader(){
  const csToggle = document.getElementById("toggle-3d-icon");
  csToggle.innerHTML = `<span class="loader" id="loader"></span>`;
  csToggle.disabled = true;
}

function endLoader(){
  const csToggle = document.getElementById("toggle-3d-icon");
  csToggle.innerHTML = '\uD83C\uDF0D';
  csToggle.disabled = false;
}

async function init_standard_grids(){
  for (const continent of continents){
    for (const tiling_level of initTilingIds){  
        const ds_id = continent + "_" + tiling_level
        await registerDataset(ds_id, `/grid?continent=${continent}&tiling_id=${tiling_level}`);
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

async function loadGrid() {
  
  const continent = document.getElementById('continent-selection').value;
  const tiling_id = document.getElementById('tiling-id').value;
  const tile_size = document.getElementById('tilesize').value;
  if (!continent) return;

  ds_id = continent + "_" + tiling_id
  if (!(ds_id in layerRegistry)){
    await registerDataset(ds_id, `/grid?continent=${continent}&tiling_id=${tiling_id}&tile_size=${tile_size}`)
    if(!(tiling_id in tiling_levels)){
      tiling_levels.push(tiling_id);
    }
    renderLayerSwitcher();
    updateStyles();
  }

  /*
  Object.keys(layerRegistry).forEach(key => {
    setLayerVisible(key, key == ds_id);
  });
  */
}


document.getElementById('loadGrid').onclick = async () =>  {
  startLoader();
  await loadGrid();
  endLoader();
  /*
  if (ol3d.getEnabled()) {
    await loadGridCesium({ continent, sampling, tiling_id });
    const source = vectorLayer.getSource();
    source.setUrl(
      `/grid?continent=${continent}&sampling=${sampling}&tiling_id=${tiling_id}`
    );
    source.refresh();
  } else {
    const source = vectorLayer.getSource();
    source.setUrl(
      `/grid?continent=${continent}&sampling=${sampling}&tiling_id=${tiling_id}`
    );
    source.refresh();

    await loadGridCesium({ continent, sampling, tiling_id });
  }
    */
};


document.getElementById('reprojectCoord').onclick = async () => {
  if(toEqui7){
    const x = document.getElementById('xCoordOther').value;
    const y = document.getElementById('yCoordOther').value;
    const other_epsg = document.getElementById('otherCRS').value;

    if (!x || !y || !other_epsg) return;

    const res = await fetch(
        `/reprojectToEqui7?x=${x}&y=${y}&epsg=${other_epsg}`
    );
    const data = await res.json();

    document.getElementById('xCoordE7').value = data.x.toFixed(3);
    document.getElementById('yCoordE7').value = data.y.toFixed(3);
    document.getElementById('proj-continent-selection').value = epsg_map[data.epsg];
  }
  else{
    const x = document.getElementById('xCoordE7').value;
    const y = document.getElementById('yCoordE7').value;
    const continent = document.getElementById('proj-continent-selection').value;
    const other_epsg = document.getElementById('otherCRS').value;

    if (!x || !y || !continent) return;

    const res = await fetch(
        `/reprojectFromEqui7?x=${x}&y=${y}&continent=${continent}&epsg=${other_epsg}`
    );
    const data = await res.json();

    document.getElementById('xCoordOther').value = data.x.toFixed(3);
    document.getElementById('yCoordOther').value = data.y.toFixed(3);
  }
};

const toggle3dIcon = document.getElementById('toggle-3d-icon');

const appPanel = document.getElementById('app');
const appIcon = document.getElementById('app-icon');
const minimizeBtn = document.getElementById('minimizeApp');

const projAppPanel = document.getElementById('proj-app');
const projAppIcon = document.getElementById('proj-app-icon');
const projMinimizeBtn = document.getElementById('minimizeProjApp');

const layerAppPanel = document.getElementById('layer-app');
const layerAppIcon = document.getElementById('layer-app-icon');
const layerMinimizeBtn = document.getElementById('minimizeLayerApp');

const tileAppPanel = document.getElementById('tile-app');
const tileAppIcon = document.getElementById('tile-app-icon');
const tileMinimizeBtn = document.getElementById('minimizeTileApp');

const tilingAppPanel = document.getElementById('tiling-app');
const tilingAppIcon = document.getElementById('tiling-app-icon');
const tilingMinimizeBtn = document.getElementById('minimizeTilingApp');


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
    // Ensure map renders correctly
    setTimeout(() => map.updateSize(), 50);
};

appIcon.onclick = () => {
    open_app("app")

    // Ensure map renders correctly
    setTimeout(() => map.updateSize(), 50);
};


projMinimizeBtn.onclick = () => {
    minimize_app()

    // Ensure map renders correctly
    setTimeout(() => map.updateSize(), 50);
};

projAppIcon.onclick = () => {
    open_app("proj")

    // Ensure map renders correctly
    setTimeout(() => map.updateSize(), 50);
};


layerMinimizeBtn.onclick = () => {
    minimize_app()

    // Ensure map renders correctly
    setTimeout(() => map.updateSize(), 50);
};

layerAppIcon.onclick = () => {
    open_app("layer")

    // Ensure map renders correctly
    setTimeout(() => map.updateSize(), 50);
};


tileMinimizeBtn.onclick = () => {
    minimize_app()

    // Ensure map renders correctly
    setTimeout(() => map.updateSize(), 50);
};

tileAppIcon.onclick = () => {
    open_app("tile")

    // Ensure map renders correctly
    setTimeout(() => map.updateSize(), 50);
};

tilingMinimizeBtn.onclick = () => {
    minimize_app()

    // Ensure map renders correctly
    setTimeout(() => map.updateSize(), 50);
};

tilingAppIcon.onclick = () => {
    open_app("tiling")

    // Ensure map renders correctly
    setTimeout(() => map.updateSize(), 50);
};


const addTilingAF = document.getElementById("addTilingAF");
const delTilingAF = document.getElementById("delTilingAF");
const selectAFTiling = document.getElementById("selectAFTiling");
addTilingAF.onclick = async () => {
  await doAddDel("AF", selectAFTiling.value, false);

}
delTilingAF.onclick = async () => {
  await doAddDel("AF", selectAFTiling.value, true);
}

const addTilingAN = document.getElementById("addTilingAN");
const delTilingAN = document.getElementById("delTilingAN");
const selectANTiling = document.getElementById("selectANTiling");
addTilingAN.onclick = async () => {
  await doAddDel("AN", selectANTiling.value, false);

}
delTilingAN.onclick = async () => {
  await doAddDel("AN", selectANTiling.value, true);
}

const addTilingAS = document.getElementById("addTilingAS");
const delTilingAS = document.getElementById("delTilingAS");
const selectASTiling = document.getElementById("selectASTiling");
addTilingAS.onclick = async () => {
  await doAddDel("AS", selectASTiling.value, false);

}
delTilingAS.onclick = async () => {
  await doAddDel("AS", selectASTiling.value, true);
}

const addTilingEU = document.getElementById("addTilingEU");
const delTilingEU = document.getElementById("delTilingEU");
const selectEUTiling = document.getElementById("selectEUTiling");
addTilingEU.onclick = async () => {
  await doAddDel("EU", selectEUTiling.value, false);

}
delTilingEU.onclick = async () => {
  await doAddDel("EU", selectEUTiling.value, true);
}

const addTilingNA = document.getElementById("addTilingNA");
const delTilingNA = document.getElementById("delTilingNA");
const selectNATiling = document.getElementById("selectNATiling");
addTilingNA.onclick = async () => {
  await doAddDel("NA", selectNATiling.value, false);

}
delTilingNA.onclick = async () => {
  await doAddDel("NA", selectNATiling.value, true);
}

const addTilingOC = document.getElementById("addTilingOC");
const delTilingOC = document.getElementById("delTilingOC");
const selectOCTiling = document.getElementById("selectOCTiling");
addTilingOC.onclick = async () => {
  await doAddDel("OC", selectOCTiling.value, false);

}
delTilingOC.onclick = async () => {
  await doAddDel("OC", selectOCTiling.value, true);
}

const addTilingSA = document.getElementById("addTilingSA");
const delTilingSA = document.getElementById("delTilingSA");
const selectSATiling = document.getElementById("selectSATiling");
addTilingSA.onclick = async () => {
  await doAddDel("SA", selectSATiling.value, false);

}
delTilingSA.onclick = async () => {
  await doAddDel("SA", selectSATiling.value, true);
}

/*
const selectAFTiling = document.getElementById("selectAFTiling");
selectAFTiling.onclick = async (e) => {
  if(e.target.tagName == "OPTION"){
    await doAddDel("AF", e.target.value);
  }
}

const selectANTiling = document.getElementById("selectANTiling");
selectANTiling.onclick = async (e) => {
  if(e.target.tagName == "OPTION"){
    await doAddDel("AN", e.target.value);
  }
}

const selectASTiling = document.getElementById("selectASTiling");
selectASTiling.onclick = async (e) => {
  if(e.target.tagName == "OPTION"){
    await doAddDel("AS", e.target.value);
  }
}

const selectEUTiling = document.getElementById("selectEUTiling");
selectEUTiling.onclick = async (e) => {
  console.log(e)
    if(e.target.tagName == "OPTION"){
      console.log("HELLO")
      await doAddDel("EU", e.target.value);
    }
}

const selectNATiling = document.getElementById("selectNATiling");
selectNATiling.onclick = async (e) => {
  if(e.target.tagName == "OPTION"){
    await doAddDel("NA", e.target.value);
  }
}

const selectOCTiling = document.getElementById("selectOCTiling");
selectOCTiling.onclick = async (e) => {
  if(e.target.tagName == "OPTION"){
    await doAddDel("OC", e.target.value);
  }
}

const selectSATiling = document.getElementById("selectSATiling");
selectSATiling.onclick = async (e) => {
  if(e.target.tagName == "OPTION"){
    await doAddDel("SA", e.target.value);
  }
}*/


const bboxBtn = document.getElementById('bboxBtn');
const bboxWrapper = document.getElementById('bboxWrapper');
bboxBtn.onclick = () => {
    tileQueryOp = "BBOX";
    if(bboxWrapper.style.display == "grid"){
      bboxWrapper.style.display = "none";
    }
    else{
      bboxWrapper.style.display = "grid";
    }
    
};

const bboxDrawBtn = document.getElementById('bboxDrawBtn');
bboxDrawBtn.onclick = () => {
    clearDrawings();
    tileQueryOp = "BBOX-DRAW";    
    drawBoundingBox();
};

const polyDrawBtn = document.getElementById('polyDrawBtn');
polyDrawBtn.onclick = () => {
    clearDrawings();
    tileQueryOp = "POLY-DRAW";
    drawPolygon();
};


function getPolygonCenter(entity) {
  const now = Cesium.JulianDate.now();
  const hierarchy =
    entity.polygon.hierarchy.getValue(now);

  const positions = hierarchy.positions;

  const bs = Cesium.BoundingSphere.fromPoints(positions);
  return bs.center;
}

function cartesianToOlCoordinate(cartesian) {
  const carto = Cesium.Cartographic.fromCartesian(cartesian);
  return ol.proj.fromLonLat([
    Cesium.Math.toDegrees(carto.longitude),
    Cesium.Math.toDegrees(carto.latitude)
  ]);
}


function moveCesiumCredits() {
  const sceneCredits = ol3d.getCesiumScene();

  if (!sceneCredits || !sceneCredits.canvas) return;

  const root = sceneCredits.canvas.parentElement;
  if (!root) return;

  // Find the wrapper that contains the Cesium logo
  const creditWrapper = [...root.children].find(el =>
    el.querySelector && el.querySelector('.cesium-credit-logoContainer')
  );

  if (!creditWrapper) {
    console.warn('Cesium credit wrapper not found');
    return;
  }

  // Move to bottom-right
  creditWrapper.style.left = 'auto';
  creditWrapper.style.right = '10px';
  creditWrapper.style.bottom = '10px';
  creditWrapper.style.top = 'auto';
  creditWrapper.style.textAlign = 'right';
  creditWrapper.style.paddingRight = '0';
}







document.getElementById('strokeWidthSlider').oninput = (e) => {
    Object.keys(styleRegistry).forEach(dsId => {
      styleRegistry[dsId].strokeWidth = e.target.value;
      updateStyle(dsId);
    });
};

document.getElementById('opacSlider').oninput = (e) => {
    Object.keys(styleRegistry).forEach(dsId => {
      styleRegistry[dsId].alpha = e.target.value/100.;
      updateStyle(dsId);
    });
};


function labelTiles(checked){
  Object.keys(layerRegistry).forEach(ds_id => {
    styleRegistry[ds_id].show_labels=checked;
    updateStyle(ds_id)
  })

  Object.values(layerRegistry).forEach(layer => {
    if (layer.visible){
      applyCesiumLabels(layer["cesium"], checked)
    }
    });
}


function showZones(checked){
  continents.forEach(continent => setLayerVisible(continent + "_ZONE", checked));
}

async function changeSampling(input){
  await fetch(
        `/sampling?sampling=${input.value}`
    )
}


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
/*
function changeAddDel(continent){
  const delText = "\uD83D\uDEAE";
  const addText = "\u2795";
  const liTiling = document.getElementById(continent);
  const innerText = liTiling.children[0].children[4].innerText

  if (innerText == addText){
    liTiling.children[0].children[4].innerText = delText;
  }
  else {
    liTiling.children[0].children[4].innerText = addText;
  }
}
*/



async function doAddDelPerTiling(continent, tilingId, remove){
    const dsId = continent + "_" + tilingId;
    if (!remove && !layerDeleteRegistry[continent]){
      url = `/grid?continent=${continent}&tiling_id=${tilingId}`
      await registerDataset(dsId, url)
    }
    else if (remove) {
      map.removeLayer(layerRegistry[dsId]["ol"]);
      if(!disable3D){
        scene.primitives.remove(layerRegistry[dsId]["cesium"][0]);
        scene.primitives.remove(layerRegistry[dsId]["cesium"][1]);
        scene.primitives.remove(layerRegistry[dsId]["cesium"][2]);
      }
      delete layerRegistry[dsId];
      delete styleRegistry[dsId];
    }
}

async function doAddDel(continent, tilingIdSel, remove){
  let tilingIdsAddDel = null;
  if(tilingIdSel == "all"){
    tilingIdsAddDel = tiling_levels;
  }
  else{
    tilingIdsAddDel = [tilingIdSel];
  }
  
  for(const tilingIdAddDel of tilingIdsAddDel){
    await doAddDelPerTiling(continent, tilingIdAddDel, remove);
  }

  renderLayerSwitcher();
  updateStyles();
}


function renderLayerSwitcher() {
  /*
  const list = document.getElementById('continentList');
  list.innerHTML = '';
  */
  const dsIds = Object.keys(layerRegistry)
  const tilingIds = tiling_levels;

  /*
  dsIds.forEach(dsId => {
    const tilingId = dsId.split("_")[1];
    if((tilingId != "ZONE") & (!tilingIds.includes(tilingId))){
      tilingIds.push(tilingId)
    }
  }) 
  */
  for(const continent of continents){
    const continentLi = document.getElementById(continent);
    const continentId = continent + "Ul";
    let tilingList = document.getElementById(continentId);
    if(tilingList == null){
      tilingList = document.createElement('ul');
    } 
    tilingList.innerHTML = "";
    tilingList.id = continentId;
    tilingList.className = "tilingList";
    for(const tilingId of tilingIds){
      const dsId = continent + "_" + tilingId
      if(dsIds.includes(dsId)){
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
        // style="float: right; margin-right: 10px;"
        tilingList.appendChild(li);
      }
    }
    enableDragAndDrop(tilingList, '.tiling-item');
    continentLi.appendChild(tilingList);
  }
  const continentList = document.getElementById('continentList');
  enableDragAndDropOuter(continentList, '.continent-item', '.tiling-item');


  const tilesTilingSelect = document.getElementById("tilesTiling")
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
  /*
  for(const tilingId of tilingIds){
    
    const liTiling = document.createElement('li');
    liTiling.className = 'continent-item';
    liTiling.draggable = true;
    liTiling.id = tilingId;
    liTiling.innerHTML = `<div onclick="collapse('${tilingId}')" style="margin-bottom: 10px; padding-left: 10px;"><span class="toggleTiling">\u2796</span>
      <span class="label">${tilingId}</span></div>`; //

    
    const continentList = document.createElement('ul');
    continentList.innerHTML = "";
    continentList.id = "tilingList";
    for(const continent of continents){
      const dsId = continent + "_" + tilingId
      if(dsIds.includes(dsId)){
        const li = document.createElement('li');
        li.className = 'tiling-item';
        li.draggable = true;
        li.dataset.layerId = dsId;

        li.innerHTML = `
        <input type="checkbox"></input>
        ${continent}
        <span style="float: right; margin-right: 10px;">
        Fill:
        <input type="color" oninput="updateFillColor('${dsId}', this.value);"></input>
        Stroke:
        <input type="color" oninput="updateStrokeColor('${dsId}', this.value);"></input>
        </span>
        `;

        li.querySelector('input').onchange = e => {
          setLayerVisible(dsId, e.target.checked);
        };
        // style="float: right; margin-right: 10px;"
        continentList.appendChild(li);
      }
    }
    enableDragAndDrop(continentList, '.tiling-item');
    liTiling.appendChild(continentList);
    list.appendChild(liTiling);
  }
    */

  /*
  Object.entries(layerRegistry).forEach(([id, layer]) => {
    if (!id.includes("ZONE")){
      activeGrid = id;
      const continent = id.split("_")[0]
      const tilingId = id.split("_")[1]
      const li = document.createElement('li');
      li.className = 'layer-item';
      li.draggable = true;
      li.dataset.layerId = id;

      li.innerHTML = `
      <input type="checkbox"></input>
      Fill:
      <input type="color" oninput="updateFillColor('${id}', this.value);"></input>
      Stroke:
      <input type="color" oninput="updateStrokeColor('${id}', this.value);"></input>
      <span>${id}</span>
      `;
      //
      //  
      // 
      // Visibility toggle
      li.querySelector('input').onchange = e => {
        setLayerVisible(id, e.target.checked);
      };

      list.appendChild(li);
      }
    });
    */
  //enableDragAndDrop(list);
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

function applyLayerOrder(itemName) {
  const ids = [...document.querySelectorAll(itemName)]
    .map(li => li.dataset.layerId);

  // 2D: OpenLayers
  const layers = map.getLayers();
  ids.forEach((id, index) => {
    const olLayer = layerRegistry[id].ol;
    if (!olLayer) return;

    layers.remove(olLayer);
    layers.insertAt(index + 1, olLayer); // +1 if base layer at 0
  });

  // 3D: Cesium
  ids.forEach(id => {
    const csPrimitives = layerRegistry[id].cesium;
    if (!csPrimitives) return;

    scene.primitives.raiseToTop(csPrimitives[0]);
    scene.primitives.raiseToTop(csPrimitives[1]);
    scene.primitives.raiseToTop(csPrimitives[2]);
  });
}

function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}


function updateStyle(ds_id){
  if(ds_id.includes("ZONE")){
    return
  }
  const style = styleRegistry[ds_id];

  layerRegistry[ds_id]["ol"].setStyle(feature => createLabelStyle(feature, style));
  if(queryData){
    queryData.forEach(tile => {
      const feature = layerRegistry[ds_id]["ol"].getSource().getFeatures().find(f => f.get('name') === tile);
      if(feature){
        const selectedStyle = createLabelStyle(feature, styleRegistry[ds_id])
        feature.setStyle(selectedStyle);
      }
      });
  }

  if(disable3D){return};

  const csPrimitives = layerRegistry[ds_id]["cesium"]

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

  const fillColorInput = document.getElementById(`FillColor_${ds_id}`);
  if(fillColorInput){
    fillColorInput.value = styleRegistry[ds_id]["fillColor"];
    const strokeColorInput = document.getElementById(`StrokeColor_${ds_id}`);
    strokeColorInput.value = styleRegistry[ds_id]["strokeColor"];
  }
  /*
  const attributes = csPrimitives[0].getGeometryInstanceAttributes("EU500M_E048N012T6");
  attributes.color = csFillColor;
  attributes.show = Cesium.ShowGeometryInstanceAttribute.toValue(true);
  */
  /*
  csPrimitives[1].geometry.width = style.strokeWidth;
  csPrimitives[1].attributes.color = csStrokeColor;
  */
  /*
  ds.entities.values.forEach(entity => {
    if (entity.polygon){
      entity.polygon.material = csFillColor;
    }
    else if(entity.polyline){
      entity.polyline.material = csStrokeColor;
      entity.polyline.width = style.strokeWidth;
    }
  });
  */
}

function updateFillColor(ds_id, fillColor){
  styleRegistry[ds_id].fillColor = fillColor;
  updateStyle(ds_id);
}

function updateStrokeWidth(ds_id, strokeWidth){
  styleRegistry[ds_id].strokeWidth = strokeWidth;
  updateStyle(ds_id);
}

function updateStrokeColor(ds_id, strokeColor){
  styleRegistry[ds_id].strokeColor = strokeColor;
  updateStyle(ds_id);
}

function setReprojMouse(flag){
  reprojMouse = flag;
  if (reprojMouse){
    document.getElementById('otherCRS').disabled = true
  }
  else{
    document.getElementById('otherCRS').disabled = false
  }
}

document.getElementById('proj-switch-icon').onclick = () => {
  if(toEqui7){
    document.getElementById('proj-switch-icon').innerText = "\u2B06\uFE0F";
    toEqui7 = false;
    document.getElementById('xCoordOther').value = "";
    document.getElementById('yCoordOther').value = "";
    if(!reprojMouse){
      document.getElementById('otherCRS').value = "";
    }
    document.getElementById('proj-continent-selection').disabled = false;
  }
  else{
    document.getElementById('proj-switch-icon').innerText = "\u2B07\uFE0F";
    toEqui7 = true;
    document.getElementById('xCoordE7').value = "";
    document.getElementById('yCoordE7').value = "";
    document.getElementById('proj-continent-selection').disabled = true;
  }
}

/*
document.getElementById("tiling-fillcolor").oninput = () => {
  const fill_color = document.getElementById("tiling-fillcolor").value
  const newStyle = new ol.style.Style({
    fill: new ol.style.Fill({
      color: fill_color
    }),
    stroke: new ol.style.Stroke({
      color: 'rgba(0,0,0,1)',
      width: 2
    })
  });
};
*/

/*
const scene = ol3d.getCesiumScene();
scene.screenSpaceCameraController.enableZoom = true;
scene.screenSpaceCameraController.enableRotate = true;
scene.screenSpaceCameraController.enableTilt = true;
scene.screenSpaceCameraController.enableTranslate = true;
scene.screenSpaceCameraController.enableZoom = true;
scene.screenSpaceCameraController.zoomEventTypes = [
Cesium.CameraEventType.WHEEL,
Cesium.CameraEventType.PINCH
];

const camera = scene.camera;


map.once('postrender', () => {
  ol3d.setEnabled(false);
  ol3d.setEnabled(true);
  map.getInteractions().forEach(i => i.setActive(false));

document.addEventListener('DOMContentLoaded', () => {
  const camera = ol3d.getCesiumScene().camera;

  document.getElementById('zoom-in').onclick = () => {
    camera.zoomIn(camera.positionCartographic.height * 0.2);
  };

  document.getElementById('zoom-out').onclick = () => {
    camera.zoomOut(camera.positionCartographic.height * 0.2);
  };
});
});

const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);

handler.setInputAction((movement) => {
  if (!ol3d.getEnabled()) return;

  const picked = scene.pick(movement.position);
  if (!picked || !picked.id) return;

  // ol-cesium attaches the OL feature here
  const olFeature = picked.id.olFeature;
  if (!olFeature) return;

  const props = olFeature.getProperties();
  popup.innerHTML = `<b>${props.name}</b>`;

  // Convert Cesium cartesian → OL coordinate
  const cartesian = scene.pickPosition(movement.position);
  if (!cartesian) return;

  const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  const coordinate = ol.proj.fromLonLat([
    Cesium.Math.toDegrees(cartographic.longitude),
    Cesium.Math.toDegrees(cartographic.latitude)
  ]);

  overlay.setPosition(coordinate);

}, Cesium.ScreenSpaceEventType.LEFT_CLICK);
*/

async function init3d(){
  await create3d();
}

init3d();
initLayers();
