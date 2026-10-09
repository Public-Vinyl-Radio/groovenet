"use client";

import React, { useState, useRef } from "react";
import { Box, Button, Text, Image, Flex } from "@chakra-ui/react";
import { toaster } from "@/components/ui/toaster";

interface CoverArtUploadProps {
  value: File | null;
  onChange: (file: File | null) => void;
  preview?: string;
  label?: string;
}

export default function CoverArtUpload({
  onChange,
  preview,
  label = "Album Cover (Optional)",
}: CoverArtUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(preview || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndSetFile = (file: File | null) => {
    if (!file) {
      onChange(null);
      setPreviewUrl(null);
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toaster.create({
        title: 'Invalid file type',
        description: 'Only JPEG, PNG, and WebP images are allowed',
        type: 'error',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toaster.create({
        title: 'File too large',
        description: 'Maximum file size is 5MB',
        type: 'error',
      });
      return;
    }

    onChange(file);

    // Generate preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleClear = () => {
    validateAndSetFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Box>
      <Text mb={2} fontSize="sm" fontWeight="medium">
        {label}
      </Text>

      {previewUrl ? (
        <Flex direction="column" gap={2}>
          <Box
            position="relative"
            width="200px"
            height="200px"
            borderRadius="md"
            overflow="hidden"
            border="1px solid"
            borderColor="border.subtle"
          >
            <Image
              src={previewUrl}
              alt="Album cover preview"
              width="100%"
              height="100%"
              objectFit="cover"
            />
          </Box>
          <Flex gap={2}>
            <Button size="sm" onClick={handleClick} variant="outline">
              Change Image
            </Button>
            <Button size="sm" onClick={handleClear} variant="outline" colorPalette="red">
              Remove
            </Button>
          </Flex>
        </Flex>
      ) : (
        <Box
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={handleClick}
          cursor="pointer"
          border="2px dashed"
          borderColor={dragActive ? "blue.400" : "border.subtle"}
          borderRadius="md"
          padding={6}
          textAlign="center"
          bg={dragActive ? "blue.subtle" : "bg.subtle"}
          _hover={{ borderColor: "blue.400", bg: "blue.subtle" }}
          transition="all 0.2s"
        >
          <Text fontSize="sm" color="fg.muted">
            Drag and drop an image here, or click to browse
          </Text>
          <Text fontSize="xs" color="fg.subtle" mt={1}>
            JPEG, PNG, or WebP (max 5MB)
          </Text>
        </Box>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
    </Box>
  );
}
