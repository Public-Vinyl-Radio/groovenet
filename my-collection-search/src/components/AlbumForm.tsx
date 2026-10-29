"use client";

import React from "react";
import { Box, Stack, Grid, Text, RatingGroup } from "@chakra-ui/react";
import LabeledInput from "@/components/form/LabeledInput";
import LabeledTextarea from "@/components/form/LabeledTextarea";
import LabeledSelect from "@/components/form/LabeledSelect";

export interface AlbumFormData {
  title: string;
  artist: string;
  year: string;
  genres: string[];
  styles: string[];
  album_notes: string;
  album_rating: number;
  purchase_price: string;
  condition: string;
  label: string;
  catalog_number: string;
  country: string;
  format: string;
  library_identifier: string;
}

interface AlbumFormProps {
  value: AlbumFormData;
  onChange: (data: AlbumFormData) => void;
  taxonomyEditor?: React.ReactNode;
}

const CONDITIONS = ["", "Mint", "Near Mint", "Very Good", "Good", "Fair", "Poor"];
const FORMATS = ["", "Vinyl", "CD", "Digital", "Cassette", "Other"];

export default function AlbumForm({ value, onChange, taxonomyEditor }: AlbumFormProps) {
  const handleChange = (field: keyof AlbumFormData, val: string | number | string[]) => {
    onChange({ ...value, [field]: val });
  };

  const handleArrayChange = (field: "genres" | "styles", val: string) => {
    // Parse comma-separated values into array
    const arr = val
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    onChange({ ...value, [field]: arr });
  };

  return (
    <Stack gap={4}>
      <Box>
        <Text fontSize="lg" fontWeight="semibold" mb={3}>
          Album Information
        </Text>
        <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4}>
          <LabeledInput
            label="Album Title *"
            value={value.title}
            onChange={(e) => handleChange("title", e.target.value)}
            placeholder="Album title"
          />
          <LabeledInput
            label="Artist *"
            value={value.artist}
            onChange={(e) => handleChange("artist", e.target.value)}
            placeholder="Artist name"
          />
          <LabeledInput
            label="Year"
            value={value.year}
            onChange={(e) => handleChange("year", e.target.value)}
            placeholder="2025"
          />
          {taxonomyEditor ? null : (
            <LabeledInput
              label="Genres"
              value={value.genres.join(", ")}
              onChange={(e) => handleArrayChange("genres", e.target.value)}
              placeholder="Electronic, House"
            />
          )}
          {taxonomyEditor ? null : (
            <LabeledInput
              label="Styles"
              value={value.styles.join(", ")}
              onChange={(e) => handleArrayChange("styles", e.target.value)}
              placeholder="Deep House, Tech House"
            />
          )}
          <Box flex="1">
            <Text mb={1} fontSize="sm">
              Album Rating
            </Text>
            <RatingGroup.Root
              value={value.album_rating}
              onValueChange={(e) => handleChange("album_rating", e.value)}
              count={5}
              size="lg"
            >
              <RatingGroup.HiddenInput />
              <RatingGroup.Control />
            </RatingGroup.Root>
          </Box>
        </Grid>
      </Box>

      {taxonomyEditor}

      <Box>
        <Text fontSize="lg" fontWeight="semibold" mb={3}>
          Collection Details
        </Text>
        <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4}>
          <LabeledInput
            label="Library Identifier"
            value={value.library_identifier}
            onChange={(e) => handleChange("library_identifier", e.target.value)}
            placeholder="LP001"
          />
          <LabeledInput
            label="Purchase Price"
            value={value.purchase_price}
            onChange={(e) => handleChange("purchase_price", e.target.value)}
            placeholder="29.99"
            type="number"
          />
          <LabeledSelect
            label="Condition"
            value={value.condition}
            onChange={(e) => handleChange("condition", e.target.value)}
          >
            {CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>
                {condition || "Select condition"}
              </option>
            ))}
          </LabeledSelect>
        </Grid>
      </Box>

      <Box>
        <Text fontSize="lg" fontWeight="semibold" mb={3}>
          Physical Details
        </Text>
        <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4}>
          <LabeledInput
            label="Label"
            value={value.label}
            onChange={(e) => handleChange("label", e.target.value)}
            placeholder="Record label"
          />
          <LabeledInput
            label="Catalog Number"
            value={value.catalog_number}
            onChange={(e) => handleChange("catalog_number", e.target.value)}
            placeholder="CAT-001"
          />
          <LabeledInput
            label="Country"
            value={value.country}
            onChange={(e) => handleChange("country", e.target.value)}
            placeholder="USA"
          />
          <LabeledSelect
            label="Format"
            value={value.format}
            onChange={(e) => handleChange("format", e.target.value)}
          >
            {FORMATS.map((format) => (
              <option key={format} value={format}>
                {format || "Select format"}
              </option>
            ))}
          </LabeledSelect>
        </Grid>
      </Box>

      <Box>
        <LabeledTextarea
          label="Album Notes"
          value={value.album_notes}
          onChange={(e) => handleChange("album_notes", e.target.value)}
          placeholder="Notes about this album..."
          rows={3}
        />
      </Box>
    </Stack>
  );
}
