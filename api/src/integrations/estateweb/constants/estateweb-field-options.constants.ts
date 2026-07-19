export type EstateWebFieldId =
  | 100
  | 101
  | 102
  | 103
  | 104
  | 105
  | 106
  | 107
  | 108
  | 109
  | 110
  | 111
  | 200
  | 201
  | 300
  | 1001
  | 1002
  | 1003
  | 1004
  | 1005
  | 1006
  | 1007
  | 1008
  | 1009
  | 1010
  | 1012
  | 1013
  | 1014
  | 1100
  | 1102
  | 1103
  | 1104
  | 1105
  | 1200
  | 1202
  | 1203
  | 1300
  | 1301
  | 1302
  | 1600
  | 2000
  | 2003
  | 2004
  | 2005
  | 2007
  | 2010
  | 2600
  | 2801
  | 2802
  | 2803
  | 2804
  | 2811
  | 2812
  | 2813
  | 2814
  | 2815
  | 2816
  | 2817
  | 2818
  | 2820
  | 2905
  | 2907
  | 2908
  | 2910
  | 3000
  | 3002
  | 3004
  | 3011
  | 3012
  | 3013
  | 3016
  | 3017
  | 3018
  | 3019
  | 3020
  | 3024
  | 3025
  | 3026
  | 3027
  | 3028
  | 3100
  | 3202
  | 4001
  | 4002
  | 4003
  | 4004
  | 4005
  | 4006
  | 4007
  | 4008
  | 4009
  | 4010
  | 4011
  | 4012
  | 4013
  | 4014
  | 4015
  | 4016
  | 4017
  | 4018
  | 4019
  | 4020
  | 4022
  | 4023
  | 4024
  | 4025
  | 4027
  | 4028
  | 4029
  | 4030
  | 4032
  | 4034
  | 4035
  | 4036
  | 4037
  | 4038
  | 4039
  | 4040
  | 4041
  | 4042
  | 4043
  | 4044
  | 4045
  | 4046
  | 4047
  | 4048
  | 4049
  | 4050
  | 4051
  | 4052
  | 4053
  | 4054
  | 4055
  | 4056
  | 4057
  | 4058
  | 4059
  | 4060
  | 4061
  | 4062
  | 4063
  | 4064
  | 4065
  | 4066
  | 4067
  | 4068
  | 4069
  | 4070
  | 4071
  | 4072
  | 4073
  | 4074
  | 4075
  | 4076
  | 4077
  | 4078
  | 4079
  | 4080
  | 4081
  | 4082
  | 4083
  | 4084
  | 4085
  | 4086
  | 4087
  | 4088
  | 4089
  | 4090
  | 4091
  | 4092
  | 4093
  | 4094
  | 4095
  | 4096
  | 4097
  | 4098
  | 4099
  | 4100
  | 4101
  | 4102
  | 4103
  | 4104
  | 4105
  | 4106
  | 4107
  | 4108
  | 4109
  | 4110
  | 4111
  | 4112
  | 4113
  | 4114
  | 4115
  | 4116
  | 4117
  | 4118
  | 4119
  | 4120
  | 4121
  | 4122
  | 4123
  | 4124
  | 4125
  | 4126
  | 4127
  | 4128
  | 4129
  | 4130
  | 4131
  | 4132
  | 4133
  | 4134
  | 4135
  | 4136
  | 4137
  | 4138
  | 4139
  | 4140
  | 4141
  | 4142
  | 4143
  | 4144
  | 4145
  | 4146
  | 4147
  | 4148
  | 4149
  | 4150
  | 4151
  | 4152
  | 4153
  | 4154
  | 4155
  | 4156
  | 4157
  | 4158
  | 4159
  | 4160
  | 4161
  | 4162
  | 4163
  | 4164
  | 4165
  | 4166
  | 4167
  | 4168
  | 4169
  | 4170
  | 4171
  | 4172
  | 4173
  | 4174
  | 4175
  | 4176
  | 4177
  | 4178
  | 4179
  | 4180
  | 4181
  | 4182
  | 4183
  | 4184
  | 4185
  | 4186
  | 4187
  | 4188
  | 4189
  | 4190
  | 4191
  | 4192
  | 4193;

export enum EstateWebSelectFieldId {
  ROAD_TYPE = 110,
  STUDIO_TYPE = 4185,
  SOIL_TYPE = 108,
  HOLIDAY_HOME_TYPE = 4186,
  ENERGY_CLASS = 2010,
  LEVEL = 4189,
  TERRAIN_SLOPE = 111,
  FLOOR = 4187,
  ORIENTATION = 109,
  PARKING_TYPE = 4188,
}

export enum EstateWebRoadType {
  NONE = 15,
  ASPHALT = 16,
  DIRT = 19,
  CONCRETE = 20,
  PEDESTRIAN = 17,
  PAVED = 18,
}

export enum EstateWebStudioType {
  LOFT = 40,
  SINGLE_ROOM = 41,
  TWO_ROOM = 42,
  STUDIO = 43,
  PENTHOUSE = 44,
}

export enum EstateWebSoilType {
  FERTILE = 1,
  ROCKY = 2,
}

export enum EstateWebHolidayHomeType {
  STUDIO = 50,
  LOFT = 51,
  APARTMENT = 52,
  FLOOR_APARTMENT = 53,
  SINGLE_ROOM = 54,
  TWO_ROOM = 55,
  MAISONETTE = 56,
  PENTHOUSE = 57,
}

export enum EstateWebEnergyClass {
  A_PLUS = 24,
  A = 25,
  B_PLUS = 26,
  B = 27,
  GAMMA = 28,
  DELTA = 29,
  EPSILON = 30,
  ZETA = 31,
  ETA = 32,
  NOT_REQUIRED = 33,
  IN_PROGRESS = 34,
}

export enum EstateWebLevel {
  GROUND = 130,
  BASEMENT = 131,
  LEVEL_1 = 132,
  LEVEL_2 = 133,
  LEVEL_3 = 134,
  LEVEL_4 = 135,
  LEVEL_MINUS_2 = 136,
  LEVEL_MINUS_3 = 137,
  LEVEL_MINUS_4 = 138,
}

export enum EstateWebTerrainSlope {
  FLAT = 21,
  SLOPED = 22,
  AMPHITHEATRICAL = 23,
}

export enum EstateWebFloor {
  BASEMENT = 60,
  SEMI_BASEMENT = 61,
  GROUND = 62,
  GROUND_RAISED = 63,
  MEZZANINE = 64,
  FLOOR_1 = 65,
  FLOOR_2 = 66,
  FLOOR_3 = 67,
  FLOOR_4 = 68,
  FLOOR_5 = 69,
  FLOOR_6 = 70,
  FLOOR_7 = 71,
  FLOOR_8 = 72,
  FLOOR_9 = 73,
  FLOOR_10 = 74,
  FLOOR_11 = 75,
  FLOOR_12 = 76,
  FLOOR_13 = 77,
  FLOOR_14 = 78,
  FLOOR_15 = 79,
  FLOOR_16 = 80,
  FLOOR_17 = 81,
  FLOOR_18 = 82,
  FLOOR_19 = 83,
  FLOOR_20 = 84,
  FLOOR_21 = 85,
  FLOOR_22 = 86,
  FLOOR_23 = 87,
  FLOOR_24 = 88,
  FLOOR_25 = 89,
  FLOOR_26 = 90,
  FLOOR_27 = 91,
  FLOOR_28 = 92,
  FLOOR_29 = 93,
  FLOOR_30 = 94,
  FLOOR_31 = 95,
  FLOOR_32 = 96,
  FLOOR_33 = 97,
  FLOOR_34 = 98,
  FLOOR_35 = 99,
  FLOOR_36 = 100,
  FLOOR_37 = 101,
  FLOOR_38 = 102,
  FLOOR_39 = 103,
  FLOOR_40 = 104,
  FLOOR_41 = 105,
  FLOOR_42 = 106,
  FLOOR_43 = 107,
  FLOOR_44 = 108,
  FLOOR_45 = 109,
  FLOOR_46 = 110,
  FLOOR_47 = 111,
  FLOOR_48 = 112,
  FLOOR_49 = 113,
  FLOOR_50 = 114,
}

export enum EstateWebOrientation {
  EAST = 3,
  EAST_WEST = 4,
  EAST_SOUTH = 5,
  NORTH = 6,
  NORTHEAST = 7,
  NORTHWEST = 8,
  WEST = 9,
  WEST_SOUTH = 10,
  SOUTH_MERIDIAN = 11,
  SOUTH = 12,
  SOUTHEAST = 13,
  SOUTHWEST = 14,
}

export enum EstateWebParkingType {
  PILOTIS = 120,
  OPEN = 121,
  CLOSED = 122,
  UNDERGROUND = 123,
}

export const ESTATEWEB_SELECT_FIELD_OPTION_VALUES: Record<
  EstateWebSelectFieldId,
  readonly number[]
> = {
  [EstateWebSelectFieldId.ROAD_TYPE]: [15, 16, 19, 20, 17, 18],
  [EstateWebSelectFieldId.STUDIO_TYPE]: [40, 41, 42, 43, 44],
  [EstateWebSelectFieldId.SOIL_TYPE]: [1, 2],
  [EstateWebSelectFieldId.HOLIDAY_HOME_TYPE]: [50, 51, 52, 53, 54, 55, 56, 57],
  [EstateWebSelectFieldId.ENERGY_CLASS]: [
    24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34,
  ],
  [EstateWebSelectFieldId.LEVEL]: [130, 131, 132, 133, 134, 135, 136, 137, 138],
  [EstateWebSelectFieldId.TERRAIN_SLOPE]: [21, 22, 23],
  [EstateWebSelectFieldId.FLOOR]: [
    60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78,
    79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97,
    98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112,
    113, 114,
  ],
  [EstateWebSelectFieldId.ORIENTATION]: [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
  ],
  [EstateWebSelectFieldId.PARKING_TYPE]: [120, 121, 122, 123],
};

export interface EstateWebSelectFieldValueMap {
  [EstateWebSelectFieldId.ROAD_TYPE]: EstateWebRoadType;
  [EstateWebSelectFieldId.STUDIO_TYPE]: EstateWebStudioType;
  [EstateWebSelectFieldId.SOIL_TYPE]: EstateWebSoilType;
  [EstateWebSelectFieldId.HOLIDAY_HOME_TYPE]: EstateWebHolidayHomeType;
  [EstateWebSelectFieldId.ENERGY_CLASS]: EstateWebEnergyClass;
  [EstateWebSelectFieldId.LEVEL]: EstateWebLevel;
  [EstateWebSelectFieldId.TERRAIN_SLOPE]: EstateWebTerrainSlope;
  [EstateWebSelectFieldId.FLOOR]: EstateWebFloor;
  [EstateWebSelectFieldId.ORIENTATION]: EstateWebOrientation;
  [EstateWebSelectFieldId.PARKING_TYPE]: EstateWebParkingType;
}

export type EstateWebSelectFieldEntry =
  | { id: EstateWebSelectFieldId.ROAD_TYPE; value: EstateWebRoadType }
  | { id: EstateWebSelectFieldId.STUDIO_TYPE; value: EstateWebStudioType }
  | { id: EstateWebSelectFieldId.SOIL_TYPE; value: EstateWebSoilType }
  | {
      id: EstateWebSelectFieldId.HOLIDAY_HOME_TYPE;
      value: EstateWebHolidayHomeType;
    }
  | { id: EstateWebSelectFieldId.ENERGY_CLASS; value: EstateWebEnergyClass }
  | { id: EstateWebSelectFieldId.LEVEL; value: EstateWebLevel }
  | { id: EstateWebSelectFieldId.TERRAIN_SLOPE; value: EstateWebTerrainSlope }
  | { id: EstateWebSelectFieldId.FLOOR; value: EstateWebFloor }
  | { id: EstateWebSelectFieldId.ORIENTATION; value: EstateWebOrientation }
  | { id: EstateWebSelectFieldId.PARKING_TYPE; value: EstateWebParkingType };

export type EstateWebSelectFieldOption =
  | EstateWebRoadType
  | EstateWebStudioType
  | EstateWebSoilType
  | EstateWebHolidayHomeType
  | EstateWebEnergyClass
  | EstateWebLevel
  | EstateWebTerrainSlope
  | EstateWebFloor
  | EstateWebOrientation
  | EstateWebParkingType;
