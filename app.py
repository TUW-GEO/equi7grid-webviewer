from flask import Flask, jsonify, render_template, request
import geopandas as gpd
import shapely
from shapely.geometry.polygon import orient
from backend.generate_data import generate_gdf
import pyproj
from pyproj import Transformer
from pytileproj.projgeom import transform_coords
from pathlib import Path
from pytileproj.tiling_system import (
    RegularTilingDefinition,
)
from pytileproj import ProjCoord
from equi7grid import get_standard_equi7grid, get_user_equi7grid
from equi7grid.create_grids import get_system_definitions

EPSG_MAP = {continent: sysdef.crs for continent, sysdef in get_system_definitions().items()}
GRID_MAP = {}
STD_SAMPLING = 500
STD_TILINGS = {"T1": STD_SAMPLING, "T3": STD_SAMPLING, "T6": STD_SAMPLING}
STD_E7 = get_standard_equi7grid(STD_TILINGS)

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/grid")
def get_grid():
    continent = request.args.get("continent", "EU")
    tiling_id = request.args.get("tiling_id", None)
    tile_size = request.args.get("tile_size", None)
    tile_size = None if tile_size in ["", None] else int(tile_size) 

    env = request.args.get("env", "ol")
    if tiling_id is not None:
        #create grid instance
        if tile_size is not None:
            if tiling_id in STD_TILINGS:
                err_msg = "Tile size tag is already in use."
                raise ValueError(err_msg)
            if len(tiling_id) != 2:
                err_msg = "The tiling ID needs to have two characters."
                raise ValueError(err_msg)
            reg_tiling_def = RegularTilingDefinition(name=tiling_id, tile_shape=tile_size)
            e7grid = get_user_equi7grid({tiling_id: STD_SAMPLING}, {tiling_id: reg_tiling_def})
            gdf = generate_gdf(e7grid, continent, tiling_id)
            GRID_MAP[tiling_id] = e7grid
        else:
            #e7grid = get_standard_equi7grid({tiling_id: sampling})
            filepath = Path(__file__).parent / "data" / f"{continent}_{tiling_id}.parquet"
            gdf = gpd.read_parquet(filepath, columns=["name", "geometry"])
        #grid_id = f"{tiling_id}_{int(sampling)}"
        #GRID_MAP[grid_id] = e7grid
    else:
        filepath = Path(__file__).parent / "data" / f"{continent.lower()}_zone.parquet"
        gdf = gpd.read_parquet(filepath, columns=["geometry"])
        gdf["name"] = continent
        if env == "cs":
            #new_geom = shapely.simplify(gdf["geometry"][0], 0.1, preserve_topology=True)
            limits_poly = shapely.Polygon([(-179.9, -84), (179.9, -84), (179.9, 84), (-179.9, 84)])
            new_geom = shapely.intersection(gdf["geometry"][0], limits_poly)
            if new_geom.geom_type == "MultiPolygon":
                polygons = new_geom.geoms
            else:
                polygons = [new_geom]
                
            """
            polygons_split = []
            for poly in polygons:
                meridian = shapely.LineString([(0, -84), (0, 84)])
                merged = shapely.ops.linemerge([poly.boundary,
                    meridian
                ])
                borders = shapely.ops.unary_union(merged)
                polygons_split.append(shapely.multipolygons(shapely.get_parts(shapely.ops.polygonize(borders))))
            """
            
            gdf = gpd.GeoDataFrame({"name": [continent] * len(polygons), "geometry": polygons}, crs=gdf.crs)
        
        #for i, row in gdf.iterrows():
        #    gdf.at[i, "geometry"] = orient(row["geometry"])
    
    return jsonify(gdf.__geo_interface__)

@app.route("/reprojectToEqui7")
def reproject_to_equi7():
    x = float(request.args["x"])
    y = float(request.args["y"])
    other_epsg = int(request.args["epsg"])
    
    proj_coord = ProjCoord(x=x, y=y, crs=pyproj.CRS.from_epsg(other_epsg))
    e7ts = STD_E7.get_system_from_coord(proj_coord)
    lon, lat = transform_coords(x, y, proj_coord.crs, 4326)
    e7_coord = e7ts.lonlat_to_xy(lon, lat)

    return jsonify({"x": e7_coord.x, "y": e7_coord.y, "epsg": e7_coord.crs.to_epsg()})


@app.route("/reprojectFromEqui7")
def reproject_from_equi7():
    x = float(request.args["x"])
    y = float(request.args["y"])
    continent = request.args["continent"]
    other_epsg = int(request.args["epsg"])
    
    e7epsg = EPSG_MAP[continent]
    transformer = Transformer.from_crs(e7epsg, other_epsg, always_xy=True)
    x2, y2 = transformer.transform(x, y)

    return jsonify({"x": x2, "y": y2})


@app.route("/tiles")
def query_tiles():
    east = float(request.args["east"])
    south = float(request.args["south"])
    west = float(request.args["west"])
    north = float(request.args["north"])
    tiling_id = request.args["tiling_id"]

    e7grid = STD_E7 if tiling_id in STD_TILINGS else GRID_MAP[tiling_id]
    e7tiles = e7grid.get_tiles_in_geog_bbox([east, south, west, north], tiling_id=tiling_id)
    tilenames = [e7tile.name for e7tile in e7tiles]
    return jsonify(tilenames)


@app.route("/traffo")
def get_traffo():
    tilename = request.args["tilename"]
    e7tile = GRID_MAP[tilename[-2:]].get_tile_from_name(tilename)
    return jsonify(e7tile.geotrans)

@app.route("/e7tile")
def get_e7tile():
    tilename = request.args["tilename"]
    e7tile = GRID_MAP[tilename[-2:]].get_tile_from_name(tilename)
    e7tile.crs = e7tile.crs.to_proj4()
    tile_def = e7tile.model_dump()
    
    return jsonify(tile_def)

if __name__ == "__main__":
    app.run(debug=True)