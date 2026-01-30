from flask import Flask, jsonify, render_template, request
import geopandas as gpd
import shapely
import shapely.wkt as swkt
import warnings
from shapely.geometry.polygon import orient
from backend.generate_data import generate_gdf, generate_grids
import pyproj
from pyproj import Transformer
from pytileproj.projgeom import transform_coords, ProjGeom
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
DEF_SEG_LEN_3857 = 10_000

app = Flask(__name__)

def get_std_tilings():
    return {"T1": STD_SAMPLING, "T3": STD_SAMPLING, "T6": STD_SAMPLING}

STD_E7 = get_standard_equi7grid(get_std_tilings())

def get_e7grid(tiling_id: str | int):
    return STD_E7 if tiling_id in get_std_tilings() else GRID_MAP[tiling_id]

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
            if tiling_id in get_std_tilings():
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
            filepath = Path(__file__).parent / "data" / f"{continent}_{tiling_id}.parquet"
            gdf = gpd.read_parquet(filepath, columns=["name", "geometry"])
    else:
        zone_poly = STD_E7[continent].proj_zone_geog.geom
        if env == "cs":
            limits_poly = shapely.Polygon([(-179.9, -84), (179.9, -84), (179.9, 84), (-179.9, 84)])
            zone_poly = shapely.intersection(zone_poly, limits_poly)
            
        if zone_poly.geom_type == "MultiPolygon":
            polygons = zone_poly.geoms
        else:
            polygons = [zone_poly]
            
        gdf = gpd.GeoDataFrame({"name": [continent] * len(polygons), "geometry": polygons}, crs=4326)
    
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


@app.route("/tilesFromBbox")
def query_tiles_from_bbox():
    east = float(request.args["east"])
    south = float(request.args["south"])
    west = float(request.args["west"])
    north = float(request.args["north"])
    tiling_id = request.args["tiling_id"]

    e7grid = get_e7grid(tiling_id)
    e7tiles = e7grid.get_tiles_in_geog_bbox([east, south, west, north], tiling_id=tiling_id)
    tilenames = [e7tile.name for e7tile in e7tiles]
    return jsonify(tilenames)


@app.route("/tilesFromWkt")
def query_tiles_from_wkt():
    wkt = request.args["wkt"]
    tiling_id = request.args["tiling_id"]

    e7grid = get_e7grid(tiling_id)
    poly = shapely.segmentize(swkt.loads(wkt), DEF_SEG_LEN_3857)
    proj_geom = ProjGeom(geom=poly, crs=pyproj.CRS.from_epsg(3857))
    e7tiles = e7grid.get_tiles_in_geom(proj_geom=proj_geom, tiling_id=tiling_id)
    tilenames = [e7tile.name for e7tile in e7tiles]
    return jsonify(tilenames)


@app.route("/traffo")
def get_traffo():
    tilename = request.args["tilename"]
    tiling_id = tilename[-2:]
    e7grid = get_e7grid(tiling_id)
    e7tile = e7grid.get_tile_from_name(tilename)
    return jsonify(e7tile.geotrans)


@app.route("/e7tile")
def get_e7tile():
    tilename = request.args["tilename"]
    tiling_id = tilename[-2:]
    e7grid = e7grid = get_e7grid(tiling_id)
    e7tile = e7grid.get_tile_from_name(tilename)
    e7tile.crs = e7tile.crs.to_proj4()
    tile_def = e7tile.model_dump()
    
    return jsonify(tile_def)


@app.route("/sampling")
def update_sampling():
    global STD_SAMPLING
    global STD_E7
    global GRID_MAP

    sampling = float(request.args["sampling"])
    STD_SAMPLING = sampling
    STD_E7 = get_standard_equi7grid(get_std_tilings())

    for tiling_id in GRID_MAP.keys():
        reg_tiling_def = RegularTilingDefinition(name=tiling_id, tile_shape=GRID_MAP[tiling_id].EU[tiling_id].tile_size)
        e7grid = get_user_equi7grid({tiling_id: STD_SAMPLING}, {tiling_id: reg_tiling_def})
        GRID_MAP[tiling_id] = e7grid

    return "Success"


def check_and_gen_data():
    data_path = Path("data")
    if data_path.exists():
        return
    
    wrn_msg = "Grid data does not exist. Generating... "
    warnings.warn(wrn_msg)

    data_path.mkdir(parents=True)
    generate_grids()


if __name__ == "__main__":
    check_and_gen_data()
    app.run(debug=True)